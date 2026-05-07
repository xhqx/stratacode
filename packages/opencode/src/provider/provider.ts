import z from "zod"
import os from "os"
import fuzzysort from "fuzzysort"
import { Config } from "../config"
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda"
import { NoSuchModelError, type Provider as SDK } from "ai"
import { Log } from "../util"
import { Npm } from "../npm"
import { Hash } from "@opencode-ai/shared/util/hash"
import { Plugin } from "../plugin"
import { makeRuntime } from "@/effect/run-service" // stratacode_change
import { NamedError } from "@opencode-ai/shared/util/error"
import { type LanguageModelV3 } from "@ai-sdk/provider"
import * as ModelsDev from "./models"
import { Auth } from "../auth"
import { Env } from "../env"
import { InstallationVersion } from "../installation/version"
import { Flag } from "../flag/flag"
import { zod } from "@/util/effect-zod"
import { iife } from "@/util/iife"
import { Global } from "../global"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Layer, Context, Schema, Types } from "effect"
import { EffectBridge } from "@/effect"
import { InstanceState } from "@/effect"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { isRecord } from "@/util/record"
import { withStatics } from "@/util/schema"

import * as ProviderTransform from "./transform"
import { ModelID, ProviderID } from "./schema"
// stratacode_change start
import {
  STRATA_BUNDLED_PROVIDERS,
  strataCustomLoaders,
  STRATA_MODEL_SCHEMA_EXTENSIONS,
  patchModelsDevModel as patchStrataModel,
  patchConfigModel as patchStrataConfigModel,
  patchCustomLoaderResult,
  strataSmallModelPriority,
  buildTimeoutSignal,
  REQUEST_TIMEOUT_MS,
} from "@/stratacode/provider/provider"
// stratacode_change end
import { PREDEFINED } from "@/stratacode/acp-client/registry" // stratacode_change
import { createACPLanguageModel } from "@/stratacode/acp-client/language-model" // stratacode_change
import { Service as ACPManagerService, defaultLayer as ACPManagerLayer } from "@/stratacode/acp-client/manager" // stratacode_change

const log = Log.create({ service: "provider" })

export function shouldUseCopilotResponsesApi(modelID: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelID)
  if (!match) return false
  return Number(match[1]) >= 5 && !modelID.startsWith("gpt-5-mini")
}

function wrapSSE(res: Response, ms: number, ctl: AbortController) {
  if (typeof ms !== "number" || ms <= 0) return res
  if (!res.body) return res
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

  const reader = res.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const part = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve, reject) => {
        const id = setTimeout(() => {
          const err = new Error("SSE read timed out")
          ctl.abort(err)
          void reader.cancel(err)
          reject(err)
        }, ms)

        reader.read().then(
          (part) => {
            clearTimeout(id)
            resolve(part)
          },
          (err) => {
            clearTimeout(id)
            reject(err)
          },
        )
      })

      if (part.done) {
        ctrl.close()
        return
      }

      ctrl.enqueue(part.value)
    },
    async cancel(reason) {
      ctl.abort(reason)
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    headers: new Headers(res.headers),
    status: res.status,
    statusText: res.statusText,
  })
}

type BundledSDK = {
  languageModel(modelId: string): LanguageModelV3
}

const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {
  "@ai-sdk/amazon-bedrock": () => import("@ai-sdk/amazon-bedrock").then((m) => m.createAmazonBedrock),
  "@ai-sdk/anthropic": () => import("@ai-sdk/anthropic").then((m) => m.createAnthropic),
  "@ai-sdk/azure": () => import("@ai-sdk/azure").then((m) => m.createAzure),
  "@ai-sdk/google": () => import("@ai-sdk/google").then((m) => m.createGoogleGenerativeAI),
  "@ai-sdk/google-vertex": () => import("@ai-sdk/google-vertex").then((m) => m.createVertex),
  "@ai-sdk/google-vertex/anthropic": () =>
    import("@ai-sdk/google-vertex/anthropic").then((m) => m.createVertexAnthropic),
  "@ai-sdk/openai": () => import("@ai-sdk/openai").then((m) => m.createOpenAI),
  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
  "@openrouter/ai-sdk-provider": () => import("@openrouter/ai-sdk-provider").then((m) => m.createOpenRouter),
  "@ai-sdk/xai": () => import("@ai-sdk/xai").then((m) => m.createXai),
  "@ai-sdk/mistral": () => import("@ai-sdk/mistral").then((m) => m.createMistral),
  "@ai-sdk/groq": () => import("@ai-sdk/groq").then((m) => m.createGroq),
  "@ai-sdk/deepinfra": () => import("@ai-sdk/deepinfra").then((m) => m.createDeepInfra),
  "@ai-sdk/cerebras": () => import("@ai-sdk/cerebras").then((m) => m.createCerebras),
  "@ai-sdk/cohere": () => import("@ai-sdk/cohere").then((m) => m.createCohere),
  "@ai-sdk/gateway": () => import("@ai-sdk/gateway").then((m) => m.createGateway),
  "@ai-sdk/togetherai": () => import("@ai-sdk/togetherai").then((m) => m.createTogetherAI),
  "@ai-sdk/perplexity": () => import("@ai-sdk/perplexity").then((m) => m.createPerplexity),
  "@ai-sdk/vercel": () => import("@ai-sdk/vercel").then((m) => m.createVercel),
  "@ai-sdk/alibaba": () => import("@ai-sdk/alibaba").then((m) => m.createAlibaba),
  "gitlab-ai-provider": () => import("gitlab-ai-provider").then((m) => m.createGitLab),
  "@ai-sdk/github-copilot": () => import("./sdk/copilot").then((m) => m.createOpenaiCompatible),
  "venice-ai-sdk-provider": () => import("venice-ai-sdk-provider").then((m) => m.createVenice),
  ...STRATA_BUNDLED_PROVIDERS, // stratacode_change
}

export type CustomModelLoader = (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
export type CustomVarsLoader = (options: Record<string, any>) => Record<string, string>
export type CustomDiscoverModels = () => Promise<Record<string, Model>>
export type CustomLoader = (provider: Info) => Effect.Effect<{
  autoload: boolean
  getModel?: CustomModelLoader
  vars?: CustomVarsLoader
  options?: Record<string, any>
  discoverModels?: CustomDiscoverModels
}>

export type CustomDep = {
  auth: (id: string) => Effect.Effect<Auth.Info | undefined>
  config: () => Effect.Effect<Config.Info>
  env: () => Effect.Effect<Record<string, string | undefined>>
  get: (key: string) => Effect.Effect<string | undefined>
}

export function useLanguageModel(sdk: any) {
  return sdk.responses === undefined && sdk.chat === undefined
}

import { custom } from "./loaders"


const ProviderApiInfo = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  npm: Schema.String,
})

const ProviderModalities = Schema.Struct({
  text: Schema.Boolean,
  audio: Schema.Boolean,
  image: Schema.Boolean,
  video: Schema.Boolean,
  pdf: Schema.Boolean,
})

const ProviderInterleaved = Schema.Union([
  Schema.Boolean,
  Schema.Struct({
    field: Schema.Literals(["reasoning_content", "reasoning_details"]),
  }),
])

const ProviderCapabilities = Schema.Struct({
  temperature: Schema.Boolean,
  reasoning: Schema.Boolean,
  attachment: Schema.Boolean,
  toolcall: Schema.Boolean,
  input: ProviderModalities,
  output: ProviderModalities,
  interleaved: ProviderInterleaved,
})

const ProviderCacheCost = Schema.Struct({
  read: Schema.Number,
  write: Schema.Number,
})

const ProviderCost = Schema.Struct({
  input: Schema.Number,
  output: Schema.Number,
  cache: ProviderCacheCost,
  experimentalOver200K: Schema.optional(
    Schema.Struct({
      input: Schema.Number,
      output: Schema.Number,
      cache: ProviderCacheCost,
    }),
  ),
})

const ProviderLimit = Schema.Struct({
  context: Schema.Number,
  input: Schema.optional(Schema.Number),
  output: Schema.Number,
})

export const Model = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  api: ProviderApiInfo,
  name: Schema.String,
  family: Schema.optional(Schema.String),
  capabilities: ProviderCapabilities,
  cost: ProviderCost,
  limit: ProviderLimit,
  status: Schema.Literals(["alpha", "beta", "deprecated", "active"]),
  options: Schema.Record(Schema.String, Schema.Any),
  headers: Schema.Record(Schema.String, Schema.String),
  release_date: Schema.String,
  variants: Schema.optional(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Any))),
  ...STRATA_MODEL_SCHEMA_EXTENSIONS, // stratacode_change
})
  .annotate({ identifier: "Model" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type Model = Types.DeepMutable<Schema.Schema.Type<typeof Model>>

export const Info = Schema.Struct({
  id: ProviderID,
  name: Schema.String,
  source: Schema.Literals(["env", "config", "custom", "api"]),
  env: Schema.Array(Schema.String),
  key: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Any),
  models: Schema.Record(Schema.String, Model),
})
  .annotate({ identifier: "Provider" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

const DefaultModelIDs = Schema.Record(Schema.String, Schema.String)

export const ListResult = Schema.Struct({
  all: Schema.Array(Info),
  default: DefaultModelIDs,
  connected: Schema.Array(Schema.String),
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type ListResult = Types.DeepMutable<Schema.Schema.Type<typeof ListResult>>

export const ConfigProvidersResult = Schema.Struct({
  providers: Schema.Array(Info),
  default: DefaultModelIDs,
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type ConfigProvidersResult = Types.DeepMutable<Schema.Schema.Type<typeof ConfigProvidersResult>>

export function defaultModelIDs<T extends { models: Record<string, { id: string }> }>(providers: Record<string, T>) {
  return mapValues(providers, (item) => sort(Object.values(item.models))[0].id)
}

export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model>
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3>
  readonly closest: (
    providerID: ProviderID,
    query: string[],
  ) => Effect.Effect<{ providerID: ProviderID; modelID: string } | undefined>
  readonly getSmallModel: (providerID: ProviderID) => Effect.Effect<Model | undefined>
  readonly defaultModel: () => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }>
}

interface State {
  models: Map<string, LanguageModelV3>
  providers: Record<ProviderID, Info>
  sdk: Map<string, BundledSDK>
  modelLoaders: Record<string, CustomModelLoader>
  varsLoaders: Record<string, CustomVarsLoader>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Provider") {}

function cost(c: ModelsDev.Model["cost"]): Model["cost"] {
  const result: Model["cost"] = {
    input: c?.input ?? 0,
    output: c?.output ?? 0,
    cache: {
      read: c?.cache_read ?? 0,
      write: c?.cache_write ?? 0,
    },
  }
  if (c?.context_over_200k) {
    result.experimentalOver200K = {
      cache: {
        read: c.context_over_200k.cache_read ?? 0,
        write: c.context_over_200k.cache_write ?? 0,
      },
      input: c.context_over_200k.input,
      output: c.context_over_200k.output,
    }
  }
  return result
}

function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model): Model {
  const base: Model = {
    id: ModelID.make(model.id),
    providerID: ProviderID.make(provider.id),
    name: model.name,
    family: model.family,
    api: {
      id: model.id,
      url: model.provider?.api ?? provider.api ?? "",
      npm: model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible",
    },
    status: model.status ?? "active",
    headers: {},
    options: {},
    cost: cost(model.cost),
    limit: {
      context: model.limit.context,
      input: model.limit.input,
      output: model.limit.output,
    },
    capabilities: {
      temperature: model.temperature ?? false,
      reasoning: model.reasoning ?? false,
      attachment: model.attachment ?? false,
      toolcall: model.tool_call ?? true,
      input: {
        text: model.modalities?.input?.includes("text") ?? false,
        audio: model.modalities?.input?.includes("audio") ?? false,
        image: model.modalities?.input?.includes("image") ?? false,
        video: model.modalities?.input?.includes("video") ?? false,
        pdf: model.modalities?.input?.includes("pdf") ?? false,
      },
      output: {
        text: model.modalities?.output?.includes("text") ?? false,
        audio: model.modalities?.output?.includes("audio") ?? false,
        image: model.modalities?.output?.includes("image") ?? false,
        video: model.modalities?.output?.includes("video") ?? false,
        pdf: model.modalities?.output?.includes("pdf") ?? false,
      },
      interleaved: model.interleaved ?? false,
    },
    release_date: model.release_date ?? "",
    variants: {},
  }
  Object.assign(base, patchStrataModel(provider.id, model)) // stratacode_change

  return {
    ...base,
    variants: mapValues(ProviderTransform.variants(base), (v) => v),
  }
}

export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
  const models: Record<string, Model> = {}
  for (const [key, model] of Object.entries(provider.models)) {
    models[key] = fromModelsDevModel(provider, model)
    for (const [mode, opts] of Object.entries(model.experimental?.modes ?? {})) {
      const id = `${model.id}-${mode}`
      const base = fromModelsDevModel(provider, model)
      models[id] = {
        ...base,
        id: ModelID.make(id),
        name: `${model.name} ${mode[0].toUpperCase()}${mode.slice(1)}`,
        cost: opts.cost ? mergeDeep(base.cost, cost(opts.cost)) : base.cost,
        options: opts.provider?.body
          ? Object.fromEntries(
              Object.entries(opts.provider.body).map(([k, v]) => [
                k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
                v,
              ]),
            )
          : base.options,
        headers: opts.provider?.headers ?? base.headers,
      }
    }
  }
  return {
    id: ProviderID.make(provider.id),
    source: "custom",
    name: provider.name,
    env: provider.env ?? [],
    options: {},
    models,
  }
}

const layer: Layer.Layer<
  Service,
  never,
  Config.Service | Auth.Service | Plugin.Service | AppFileSystem.Service | Env.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const env = yield* Env.Service
    const plugin = yield* Plugin.Service

    const state = yield* InstanceState.make<State>(() =>
      Effect.gen(function* () {
        using _ = log.time("state")
        const bridge = yield* EffectBridge.make()
        const cfg = yield* config.get()
        const modelsDev = yield* Effect.promise(() => ModelsDev.get())
        const database = mapValues(modelsDev, fromModelsDevProvider)

        const providers: Record<ProviderID, Info> = {} as Record<ProviderID, Info>
        const languages = new Map<string, LanguageModelV3>()
        const modelLoaders: {
          [providerID: string]: CustomModelLoader
        } = {}
        const varsLoaders: {
          [providerID: string]: CustomVarsLoader
        } = {}
        const sdk = new Map<string, BundledSDK>()
        const discoveryLoaders: {
          [providerID: string]: CustomDiscoverModels
        } = {}
        const dep = {
          auth: (id: string) => auth.get(id).pipe(Effect.orDie),
          config: () => config.get(),
          env: () => env.all(),
          get: (key: string) => env.get(key),
        }

        log.info("init")

        function mergeProvider(providerID: ProviderID, provider: Partial<Info>) {
          const existing = providers[providerID]
          if (existing) {
            // @ts-expect-error
            providers[providerID] = mergeDeep(existing, provider)
            return
          }
          const match = database[providerID]
          if (!match) return
          // @ts-expect-error
          providers[providerID] = mergeDeep(match, provider)
        }

        // load plugins first so config() hook runs before reading cfg.provider
        const plugins = yield* plugin.list()

        // now read config providers - includes any modifications from plugin config() hook
        const configProviders = Object.entries(cfg.provider ?? {})
        const disabled = new Set(cfg.disabled_providers ?? [])
        const enabled = cfg.enabled_providers ? new Set(cfg.enabled_providers) : null

        function isProviderAllowed(providerID: ProviderID): boolean {
          if (enabled && !enabled.has(providerID)) return false
          if (disabled.has(providerID)) return false
          return true
        }

        // extend database from config
        for (const [providerID, provider] of configProviders) {
          const existing = database[providerID]
          const parsed: Info = {
            id: ProviderID.make(providerID),
            name: provider.name ?? existing?.name ?? providerID,
            env: provider.env ?? existing?.env ?? [],
            options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
            source: "config",
            models: existing?.models ?? {},
          }

          for (const [modelID, model] of Object.entries(provider.models ?? {})) {
            if (!model) continue // stratacode_change - null entries are transient delete sentinels
            const existingModel = parsed.models[model.id ?? modelID]
            const name = iife(() => {
              if (model.name) return model.name
              if (model.id && model.id !== modelID) return modelID
              return existingModel?.name ?? modelID
            })
            const parsedModel: Model = {
              id: ModelID.make(modelID),
              api: {
                id: model.id ?? existingModel?.api.id ?? modelID,
                npm:
                  model.provider?.npm ??
                  provider.npm ??
                  existingModel?.api.npm ??
                  modelsDev[providerID]?.npm ??
                  "@ai-sdk/openai-compatible",
                url: model.provider?.api ?? provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api ?? "",
              },
              status: model.status ?? existingModel?.status ?? "active",
              name,
              providerID: ProviderID.make(providerID),
              capabilities: {
                temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
                reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
                attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
                toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
                input: {
                  text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
                  audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
                  image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
                  video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
                  pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false,
                },
                output: {
                  text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
                  audio:
                    model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
                  image:
                    model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
                  video:
                    model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
                  pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false,
                },
                interleaved: model.interleaved ?? false,
              },
              cost: {
                input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
                output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
                cache: {
                  read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
                  write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0,
                },
              },
              options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
              limit: {
                context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
                input: model.limit?.input ?? existingModel?.limit?.input,
                output: model.limit?.output ?? existingModel?.limit?.output ?? 0,
              },
              headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
              family: model.family ?? existingModel?.family ?? "",
              release_date: model.release_date ?? existingModel?.release_date ?? "",
              // variants: {}, // stratacode_change, moved into patchStrataConfigModel
              ...patchStrataConfigModel(model, existingModel), // stratacode_change
            }
            const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
            parsedModel.variants = mapValues(
              pickBy(merged, (v): v is NonNullable<typeof v> => !!v && !v.disabled), // stratacode_change - drop null delete sentinels
              (v) => omit(v, ["disabled"]),
            )
            parsed.models[modelID] = parsedModel
          }
          database[providerID] = parsed
        }

        // stratacode_change start - load auths before env so OAuth plugins can override inherited credentials
        const auths = yield* auth.all().pipe(Effect.orDie)
        // load env
        const envs = yield* env.all()
        for (const [id, provider] of Object.entries(database)) {
          const providerID = ProviderID.make(id)
          if (disabled.has(providerID)) continue
          // stratacode_change start - prefer explicit OAuth auth over inherited env credentials
          if (
            auths[providerID]?.type === "oauth" &&
            plugins.some((x) => x.auth?.provider === providerID && x.auth.loader)
          ) {
            continue
          }
          const apiKey = provider.env.map((item) => envs[item]).find(Boolean)
          // stratacode_change end
          if (!apiKey) continue
          mergeProvider(providerID, {
            source: "env",
            key: provider.env.length === 1 ? apiKey : undefined,
          })
        }

        // load apikeys
        for (const [id, provider] of Object.entries(auths)) {
          const providerID = ProviderID.make(id)
          if (disabled.has(providerID)) continue
          if (provider.type === "api") {
            mergeProvider(providerID, {
              source: "api",
              key: provider.key,
            })
          }
        }

        // plugin auth loader - database now has entries for config providers
        for (const plugin of plugins) {
          if (!plugin.auth) continue
          const providerID = ProviderID.make(plugin.auth.provider)
          if (disabled.has(providerID)) continue

          const stored = yield* auth.get(providerID).pipe(Effect.orDie)
          if (!stored) continue
          if (!plugin.auth.loader) continue

          const options = yield* Effect.promise(() =>
            plugin.auth!.loader!(
              () => bridge.promise(auth.get(providerID).pipe(Effect.orDie)) as any,
              database[plugin.auth!.provider],
            ),
          )
          const opts = options ?? {}
          const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
          mergeProvider(providerID, patch)
        }

        // stratacode_change start - resolve env once for patchCustomLoaderResult (azure env fallback)
        const strataEnv = yield* env.all()
        // stratacode_change end
        for (const [id, fn] of Object.entries({ ...custom(dep), ...strataCustomLoaders(dep) })) {
          // stratacode_change
          const providerID = ProviderID.make(id)
          if (disabled.has(providerID)) continue
          const data = database[providerID]
          if (!data) {
            log.error("Provider does not exist in model list " + providerID)
            continue
          }
          const result = yield* fn(data)
          if (result) patchCustomLoaderResult(id, result, strataEnv) // stratacode_change
          if (result && (result.autoload || providers[providerID])) {
            if (result.getModel) modelLoaders[providerID] = result.getModel
            if (result.vars) varsLoaders[providerID] = result.vars
            if (result.discoverModels) discoveryLoaders[providerID] = result.discoverModels
            const opts = result.options ?? {}
            const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
            mergeProvider(providerID, patch)
          }
        }

        // load config - re-apply with updated data
        for (const [id, provider] of configProviders) {
          const providerID = ProviderID.make(id)
          // stratacode_change start - keep OAuth plugin source when config and Codex auth coexist
          const oauth =
            auths[providerID]?.type === "oauth" && plugins.some((x) => x.auth?.provider === providerID && x.auth.loader)
          const partial: Partial<Info> = oauth ? {} : { source: "config" }
          if (provider.env) partial.env = provider.env
          // stratacode_change end
          if (provider.name) partial.name = provider.name
          if (provider.options) partial.options = provider.options
          mergeProvider(providerID, partial)
        }

        // stratacode_change start - inject ACP providers as native providers
        const acpProvidersConfig = {
          ...(cfg.acp_agents ?? {}),
          ...(cfg.acp_providers ?? {}),
        }
        for (const [key, preset] of Object.entries(PREDEFINED)) {
          const userConf = acpProvidersConfig[key]
          if (!userConf?.enabled) continue

          const providerID = ProviderID.make(`acp-${key}`)
          if (disabled.has(providerID)) continue

          // Merge registry defaults (command, env) into user config so the
          // transport layer always has a command even when the user only sets
          // { predefined: true, enabled: true, model: "..." }.
          const merged = {
            ...userConf,
            command: userConf.command ?? preset.command,
            env: { ...(preset.env ? Object.fromEntries(preset.env.map((e: string) => [e, ""])) : {}), ...(userConf.env ?? {}) },
          }

          const models: Record<string, Model> = {}
          const availableModels = userConf.discoveredModels?.length ? userConf.discoveredModels : [{ id: "default", name: preset.name }]
          for (const m of availableModels) {
            models[m.id] = {
              id: ModelID.make(m.id),
              name: m.name,
              providerID,
              api: { id: m.id, npm: "acp", url: "" },
              status: "active",
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: true,
                toolcall: true,
                input: { text: true, audio: false, image: false, video: false, pdf: false },
                output: { text: true, audio: false, image: false, video: false, pdf: false },
                interleaved: false,
              },
              cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
              options: { acp: true, acpKey: key, acpConfig: merged },
              limit: { context: 0, output: 0 },
              headers: {},
              family: "",
              release_date: "",
              variants: {},
            }
          }

          mergeProvider(providerID, {
            name: `[ACP] ${preset.name}`,
            env: [],
            source: "custom",
            models,
            options: { acp: true, acpKey: key, acpConfig: merged },
          })

          // Ensure it's forcefully added if not present in database
          if (!providers[providerID]) {
            providers[providerID] = {
              id: providerID,
              name: `[ACP] ${preset.name}`,
              env: [],
              source: "custom",
              options: { acp: true, acpKey: key, acpConfig: merged },
              models,
            }
          }
        }

        // Inject custom (non-predefined) ACP providers
        for (const [key, userConf] of Object.entries(acpProvidersConfig)) {
          if (key in PREDEFINED) continue // already handled above
          if (!userConf?.enabled) continue

          const providerID = ProviderID.make(`acp-${key}`)
          if (disabled.has(providerID)) continue

          const models: Record<string, Model> = {}
          const availableModels = userConf.discoveredModels?.length ? userConf.discoveredModels : [{ id: "default", name: userConf.name ?? key }]
          for (const m of availableModels) {
            models[m.id] = {
              id: ModelID.make(m.id),
              name: m.name,
              providerID,
              api: { id: m.id, npm: "acp", url: "" },
              status: "active",
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: true,
                toolcall: true,
                input: { text: true, audio: false, image: false, video: false, pdf: false },
                output: { text: true, audio: false, image: false, video: false, pdf: false },
                interleaved: false,
              },
              cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
              options: { acp: true, acpKey: key, acpConfig: userConf },
              limit: { context: 0, output: 0 },
              headers: {},
              family: "",
              release_date: "",
              variants: {},
            }
          }

          mergeProvider(providerID, {
            name: `[ACP] ${userConf.name ?? key}`,
            env: [],
            source: "custom",
            models,
            options: { acp: true, acpKey: key, acpConfig: userConf },
          })

          // Ensure it's forcefully added if not present in database
          if (!providers[providerID]) {
            providers[providerID] = {
              id: providerID,
              name: `[ACP] ${userConf.name ?? key}`,
              env: [],
              source: "custom",
              options: { acp: true, acpKey: key, acpConfig: userConf },
              models,
            }
          }
        }
        // stratacode_change end

        const gitlab = ProviderID.make("gitlab")
        if (discoveryLoaders[gitlab] && providers[gitlab] && isProviderAllowed(gitlab)) {
          yield* Effect.promise(async () => {
            try {
              const discovered = await discoveryLoaders[gitlab]()
              for (const [modelID, model] of Object.entries(discovered)) {
                if (!providers[gitlab].models[modelID]) {
                  providers[gitlab].models[modelID] = model
                }
              }
            } catch (e) {
              log.warn("state discovery error", { id: "gitlab", error: e })
            }
          })
        }

        for (const hook of plugins) {
          const p = hook.provider
          const models = p?.models
          if (!p || !models) continue

          const providerID = ProviderID.make(p.id)
          if (disabled.has(providerID)) continue

          const provider = providers[providerID]
          if (!provider) continue
          const pluginAuth = yield* auth.get(providerID).pipe(Effect.orDie)

          provider.models = yield* Effect.promise(async () => {
            const next = await models(provider, { auth: pluginAuth })
            return Object.fromEntries(
              Object.entries(next).map(([id, model]) => [
                id,
                {
                  ...model,
                  id: ModelID.make(id),
                  providerID,
                },
              ]),
            )
          })
        }

        for (const [id, provider] of Object.entries(providers)) {
          const providerID = ProviderID.make(id)
          if (!isProviderAllowed(providerID)) {
            delete providers[providerID]
            continue
          }

          const configProvider = cfg.provider?.[providerID]

          for (const [modelID, model] of Object.entries(provider.models)) {
            model.api.id = model.api.id ?? model.id ?? modelID
            if (
              modelID === "gpt-5-chat-latest" ||
              (providerID === ProviderID.openrouter && modelID === "openai/gpt-5-chat")
            )
              delete provider.models[modelID]
            if (model.status === "alpha" && !Flag.STRATA_ENABLE_EXPERIMENTAL_MODELS) delete provider.models[modelID]
            if (model.status === "deprecated") delete provider.models[modelID]
            if (
              (configProvider?.blacklist && configProvider.blacklist.includes(modelID)) ||
              (configProvider?.whitelist && !configProvider.whitelist.includes(modelID))
            )
              delete provider.models[modelID]

            model.variants = mapValues(ProviderTransform.variants(model), (v) => v)

            const configVariants = configProvider?.models?.[modelID]?.variants
            if (configVariants && model.variants) {
              const merged = mergeDeep(model.variants, configVariants)
              model.variants = mapValues(
                pickBy(merged, (v): v is NonNullable<typeof v> => !!v && !v.disabled), // stratacode_change - drop null delete sentinels
                (v) => omit(v, ["disabled"]),
              )
            }
          }

          if (Object.keys(provider.models).length === 0) {
            delete providers[providerID]
            continue
          }

          log.info("found", { providerID })
        }

        return {
          models: languages,
          providers,
          sdk,
          modelLoaders,
          varsLoaders,
        }
      }),
    )

    const list = Effect.fn("Provider.list")(() => InstanceState.use(state, (s) => s.providers))

    // stratacode_change start - add acpManager to resolveSDK
    async function resolveSDK(
      model: Model,
      s: State,
      envs: Record<string, string | undefined>,
      acpManager?: import("@/stratacode/acp-client/manager").Interface
    ) {
    // stratacode_change end
      try {
        using _ = log.time("getSDK", {
          providerID: model.providerID,
        })
        const provider = s.providers[model.providerID]!
        const options = { ...provider.options }

        if (model.providerID === "google-vertex" && !model.api.npm.includes("@ai-sdk/openai-compatible")) {
          delete options.fetch
        }

        if (model.api.npm.includes("@ai-sdk/openai-compatible") && options["includeUsage"] !== false) {
          options["includeUsage"] = true
        }

        const baseURL = iife(() => {
          let url =
            typeof options["baseURL"] === "string" && options["baseURL"] !== "" ? options["baseURL"] : model.api.url
          if (!url) return

          const loader = s.varsLoaders[model.providerID]
          if (loader) {
            const vars = loader(options)
            for (const [key, value] of Object.entries(vars)) {
              const field = "${" + key + "}"
              url = url.replaceAll(field, value)
            }
          }

          url = url.replace(/\$\{([^}]+)\}/g, (item, key) => {
            const val = envs[String(key)]
            return val ?? item
          })
          return url
        })

        if (baseURL !== undefined) options["baseURL"] = baseURL
        if (options["apiKey"] === undefined && provider.key) options["apiKey"] = provider.key
        if (model.headers)
          options["headers"] = {
            ...options["headers"],
            ...model.headers,
          }

        const key = Hash.fast(
          JSON.stringify({
            providerID: model.providerID,
            npm: model.api.npm,
            options,
          }),
        )
        const existing = s.sdk.get(key)
        if (existing) return existing

        const customFetch = options["fetch"]
        const chunkTimeout = options["chunkTimeout"]
        delete options["chunkTimeout"]
        const proxy = options["proxy"] // stratacode_change
        delete options["proxy"] // stratacode_change

        options["fetch"] = async (input: any, init?: BunFetchRequestInit) => {
          const fetchFn = customFetch ?? fetch
          const opts = { ...(init ?? {}) } // stratacode_change - Create new object to avoid mutating caller's init

          // stratacode_change start - apply provider proxy if request doesn't override it
          if (proxy && !opts.proxy) {
            opts.proxy = proxy
          }
          // stratacode_change end

          const chunkAbortCtl = typeof chunkTimeout === "number" && chunkTimeout > 0 ? new AbortController() : undefined
          // stratacode_change start - use cancellable timeout for connection phase
          const timeout = buildTimeoutSignal(options)
          const signals: AbortSignal[] = []

          if (opts.signal) signals.push(opts.signal)
          if (chunkAbortCtl) signals.push(chunkAbortCtl.signal)
          if (timeout.signal) signals.push(timeout.signal)
          // stratacode_change end

          const combined = signals.length === 0 ? null : signals.length === 1 ? signals[0] : AbortSignal.any(signals)
          if (combined) opts.signal = combined

          // Strip openai itemId metadata following what codex does
          if (model.api.npm === "@ai-sdk/openai" && opts.body && opts.method === "POST") {
            const body = JSON.parse(opts.body as string)
            const isAzure = model.providerID.includes("azure")
            const keepIds = isAzure && body.store === true
            if (!keepIds && Array.isArray(body.input)) {
              for (const item of body.input) {
                if ("id" in item) {
                  delete item.id
                }
              }
              opts.body = JSON.stringify(body)
            }
          }

          // stratacode_change start - clear connection-phase timeout once headers arrive
          try {
            const res = await fetchFn(input, {
              ...opts,
              // @ts-ignore see here: https://github.com/oven-sh/bun/issues/16682
              timeout: false,
            })
            timeout.clear()
            if (!chunkAbortCtl) return res
            return wrapSSE(res, chunkTimeout, chunkAbortCtl)
          } catch (err) {
            timeout.clear()
            throw err
          }
          // stratacode_change end
        }

        const bundledLoader = BUNDLED_PROVIDERS[model.api.npm]
        if (bundledLoader) {
          log.info("using bundled provider", {
            providerID: model.providerID,
            pkg: model.api.npm,
          })
          const factory = await bundledLoader()
          const loaded = factory({
            name: model.providerID,
            ...options,
          })
          s.sdk.set(key, loaded)
          return loaded as SDK
        }

        let installedPath: string
        // stratacode_change start - return ACP models wrapped as AI SDK language models
        if (model.api.npm === "acp") {
          if (!acpManager) throw new Error("ACP Manager is not available.")
          return {
            languageModel: (modelId: string, opts?: any) => {
              return createACPLanguageModel(acpManager, model)
            }
          } as any
        }
        // stratacode_change end
        if (!model.api.npm.startsWith("file://")) {
          const item = await Npm.add(model.api.npm)
          if (!item.entrypoint) throw new Error(`Package ${model.api.npm} has no import entrypoint`)
          installedPath = item.entrypoint
        } else {
          log.info("loading local provider", { pkg: model.api.npm })
          installedPath = model.api.npm
        }

        // `installedPath` is a local entry path or an existing `file://` URL. Normalize
        // only path inputs so Node on Windows accepts the dynamic import.
        const importSpec = installedPath.startsWith("file://") ? installedPath : pathToFileURL(installedPath).href
        const mod = await import(importSpec)

        const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
        const loaded = fn({
          name: model.providerID,
          ...options,
        })
        s.sdk.set(key, loaded)
        return loaded as SDK
      } catch (e) {
        throw new InitError({ providerID: model.providerID }, { cause: e })
      }
    }

    const getProvider = Effect.fn("Provider.getProvider")((providerID: ProviderID) =>
      InstanceState.use(state, (s) => s.providers[providerID]),
    )

    const getModel = Effect.fn("Provider.getModel")(function* (providerID: ProviderID, modelID: ModelID) {
      const s = yield* InstanceState.get(state)
      const provider = s.providers[providerID]
      if (!provider) {
        const available = Object.keys(s.providers)
        const matches = fuzzysort.go(providerID, available, { limit: 3, threshold: -10000 })
        throw new ModelNotFoundError({ providerID, modelID, suggestions: matches.map((m) => m.target) })
      }

      const info = provider.models[modelID]
      if (!info) {
        const available = Object.keys(provider.models)
        const matches = fuzzysort.go(modelID, available, { limit: 3, threshold: -10000 })
        throw new ModelNotFoundError({ providerID, modelID, suggestions: matches.map((m) => m.target) })
      }
      return info
    })

    const getLanguage = Effect.fn("Provider.getLanguage")(function* (model: Model) {
      const s = yield* InstanceState.get(state)
      const envs = yield* env.all()
      const key = `${model.providerID}/${model.id}`
      if (s.models.has(key)) return s.models.get(key)!

      // stratacode_change start - get ACP manager
      const acpManager = yield* Effect.serviceOption(ACPManagerService)
      // stratacode_change end

      return yield* Effect.promise(async () => {
        const provider = s.providers[model.providerID]
        // stratacode_change start
        const sdk = await resolveSDK(model, s, envs, acpManager._tag === "Some" ? acpManager.value : undefined)
        // stratacode_change end

        try {
          const language = s.modelLoaders[model.providerID]
            ? await s.modelLoaders[model.providerID](sdk, model.api.id, {
                ...provider.options,
                ...model.options,
              })
            : sdk.languageModel(model.api.id)
          s.models.set(key, language)
          return language
        } catch (e) {
          if (e instanceof NoSuchModelError)
            throw new ModelNotFoundError(
              {
                modelID: model.id,
                providerID: model.providerID,
              },
              { cause: e },
            )
          throw e
        }
      })
    })

    const closest = Effect.fn("Provider.closest")(function* (providerID: ProviderID, query: string[]) {
      const s = yield* InstanceState.get(state)
      const provider = s.providers[providerID]
      if (!provider) return undefined
      for (const item of query) {
        for (const modelID of Object.keys(provider.models)) {
          if (modelID.includes(item)) return { providerID, modelID }
        }
      }
      return undefined
    })

    const getSmallModel = Effect.fn("Provider.getSmallModel")(function* (providerID: ProviderID) {
      const cfg = yield* config.get()

      if (cfg.small_model) {
        const parsed = parseModel(cfg.small_model)
        return yield* getModel(parsed.providerID, parsed.modelID)
      }

      const s = yield* InstanceState.get(state)
      const provider = s.providers[providerID]
      if (!provider) return undefined

      let priority = [
        "claude-haiku-4-5",
        "claude-haiku-4.5",
        "3-5-haiku",
        "3.5-haiku",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gpt-5-nano",
      ]
      if (providerID.startsWith("opencode")) {
        priority = ["gpt-5-nano"]
      }
      if (providerID.startsWith("github-copilot")) {
        priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
      }
      // stratacode_change start
      const strataPriority = strataSmallModelPriority(providerID)
      if (strataPriority) priority = strataPriority
      // stratacode_change end
      for (const item of priority) {
        if (providerID === ProviderID.amazonBedrock) {
          const crossRegionPrefixes = ["global.", "us.", "eu."]
          const candidates = Object.keys(provider.models).filter((m) => m.includes(item))

          const globalMatch = candidates.find((m) => m.startsWith("global."))
          if (globalMatch) return yield* getModel(providerID, ModelID.make(globalMatch))

          const region = provider.options?.region
          if (region) {
            const regionPrefix = region.split("-")[0]
            if (regionPrefix === "us" || regionPrefix === "eu") {
              const regionalMatch = candidates.find((m) => m.startsWith(`${regionPrefix}.`))
              if (regionalMatch) return yield* getModel(providerID, ModelID.make(regionalMatch))
            }
          }

          const unprefixed = candidates.find((m) => !crossRegionPrefixes.some((p) => m.startsWith(p)))
          if (unprefixed) return yield* getModel(providerID, ModelID.make(unprefixed))
        } else {
          for (const model of Object.keys(provider.models)) {
            if (model.includes(item)) return yield* getModel(providerID, ModelID.make(model))
          }
        }
      }

      return undefined
    })

    const defaultModel = Effect.fn("Provider.defaultModel")(function* () {
      const cfg = yield* config.get()
      if (cfg.model) return parseModel(cfg.model)

      const s = yield* InstanceState.get(state)
      const recent = yield* fs.readJson(path.join(Global.Path.state, "model.json")).pipe(
        Effect.map((x): { providerID: ProviderID; modelID: ModelID }[] => {
          if (!isRecord(x) || !Array.isArray(x.recent)) return []
          return x.recent.flatMap((item) => {
            if (!isRecord(item)) return []
            if (typeof item.providerID !== "string") return []
            if (typeof item.modelID !== "string") return []
            return [{ providerID: ProviderID.make(item.providerID), modelID: ModelID.make(item.modelID) }]
          })
        }),
        Effect.catch(() => Effect.succeed([] as { providerID: ProviderID; modelID: ModelID }[])),
      )
      for (const entry of recent) {
        const provider = s.providers[entry.providerID]
        if (!provider) continue
        if (!provider.models[entry.modelID]) continue
        return { providerID: entry.providerID, modelID: entry.modelID }
      }

      const provider = Object.values(s.providers).find((p) => !cfg.provider || Object.keys(cfg.provider).includes(p.id))
      if (!provider) throw new Error("no providers found")
      const [model] = sort(Object.values(provider.models))
      if (!model) throw new Error("no models found")
      return {
        providerID: provider.id,
        modelID: model.id,
      }
    })

    return Service.of({ list, getProvider, getModel, getLanguage, closest, getSmallModel, defaultModel })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(Env.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
  ),
)

const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
export function sort<T extends { id: string }>(models: T[]) {
  return sortBy(
    models,
    [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
    [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
    [(model) => model.id, "desc"],
  )
}

// stratacode_change start - legacy promise helpers for Strata callsites
const { runPromise: runProviderPromise } = makeRuntime(Service, Layer.merge(defaultLayer, ACPManagerLayer))
export const list = () => runProviderPromise((svc) => svc.list())
export const getModel = (providerID: ProviderID, modelID: ModelID) =>
  runProviderPromise((svc) => svc.getModel(providerID, modelID))
export const getProvider = (providerID: ProviderID) => runProviderPromise((svc) => svc.getProvider(providerID))
export const getLanguage = (model: Model) => runProviderPromise((svc) => svc.getLanguage(model))
export const getSmallModel = (providerID: ProviderID) => runProviderPromise((svc) => svc.getSmallModel(providerID))
export const defaultModel = () => runProviderPromise((svc) => svc.defaultModel())
// stratacode_change end

export function parseModel(model: string) {
  const [providerID, ...rest] = model.split("/")
  return {
    providerID: ProviderID.make(providerID),
    modelID: ModelID.make(rest.join("/")),
  }
}

export const ModelNotFoundError = NamedError.create(
  "ProviderModelNotFoundError",
  z.object({
    providerID: ProviderID.zod,
    modelID: ModelID.zod,
    suggestions: z.array(z.string()).optional(),
  }),
)

export const InitError = NamedError.create(
  "ProviderInitError",
  z.object({
    providerID: ProviderID.zod,
  }),
)
