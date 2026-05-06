import { Config } from "../config"
import z from "zod"
import { Provider } from "../provider"
import { ModelID, ProviderID } from "../provider/schema"
import { generateObject, streamObject, type ModelMessage } from "ai"
import { Instance } from "../project/instance"
import { Truncate } from "../tool"
import { Auth } from "../auth"
import { ProviderTransform } from "../provider"

import PROMPT_GENERATE from "./generate.txt"
import { makeRuntime } from "@/effect/run-service" // stratacode_change
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_MEMORY_EXTRACTOR from "./prompt/memory_extractor.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@/global" // stratacode_change
import { StratacodePaths } from "@/stratacode/paths" // stratacode_change
import path from "path" // stratacode_change
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer } from "effect"
import { InstanceState } from "@/effect"
import * as StrataAgent from "@/stratacode/agent" // stratacode_change

export const Info = z
  .object({
    name: z.string(),
    displayName: z.string().optional(), // stratacode_change - human-readable name for org modes
    description: z.string().optional(),
    deprecated: z.boolean().optional(), // stratacode_change
    mode: z.enum(["subagent", "primary", "all"]),
    native: z.boolean().optional(),
    hidden: z.boolean().optional(),
    topP: z.number().optional(),
    temperature: z.number().optional(),
    color: z.string().optional(),
    permission: Permission.Ruleset.zod,
    model: z
      .object({
        modelID: ModelID.zod,
        providerID: ProviderID.zod,
      })
      .optional(),
    variant: z.string().optional(),
    prompt: z.string().optional(),
    options: z.record(z.string(), z.any()),
    steps: z.number().int().positive().optional(),
    fallback_models: z.array(z.string()).optional(), // stratacode_change
    // stratacode_change start
    model_pool: z
      .object({
        enabled: z.boolean().optional(),
        models: z.array(z.string()),
        max_concurrent: z.number().int().positive().optional(),
        timeout: z.number().positive().optional(),
      })
      .optional(),
    retry: z
      .object({
        enabled: z.boolean().optional(),
        limit: z.number().int().nonnegative().optional(),
        delay: z.number().positive().optional(),
        max_delay: z.number().positive().optional(),
      })
      .optional(),
    // stratacode_change end
  })
  .meta({
    ref: "Agent",
  })
export type Info = z.infer<typeof Info>

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderID; modelID: ModelID }
  }) => Effect.Effect<{
    identifier: string
    whenToUse: string
    systemPrompt: string
  }>
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@opencode/Agent") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (_ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        // stratacode_change start - include global config dirs so agents can read them without prompting
        const whitelistedDirs = [
          Truncate.GLOB,
          ...skillDirs.map((dir) => path.join(dir, "*")),
          path.join(Global.Path.config, "*"),
          ...StratacodePaths.globalDirs().map((dir) => path.join(dir, "*")),
        ]
        // stratacode_change end

        const baseDefaults = Permission.fromConfig({
          // stratacode_change: renamed from defaults
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          suggest: "deny", // stratacode_change
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        // stratacode_change start - patch defaults with bash allowlist and recall permission
        const strata = StrataAgent.prepare(cfg)
        const defaults = Permission.merge(baseDefaults, strata.defaultsPatch)
        // stratacode_change end

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          build: {
            name: "build",
            description: "The default agent. Executes tools based on configured permissions.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                suggest: "allow", // stratacode_change
                plan_enter: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          plan: {
            name: "plan",
            description: "Plan mode. Disallows all edit tools.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".opencode", "plans", "*.md")]: "allow",
                  [path.relative(Instance.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          general: {
            name: "general",
            description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                webfetch: "allow",
                websearch: "allow",
                codesearch: "allow",
                read: "allow",
                external_directory: {
                  "*": "ask",
                  ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
                },
              }),
              user,
            ),
            description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
          },
          memory_extractor: {
            name: "memory_extractor",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                edit: "allow",
                bash: "allow",
                read: "allow",
                list: "allow",
                glob: "allow",
              }),
              user,
            ),
            description:
              "Agent for analyzing git commits and extracting semantic project memory into .stratacode/memory/ files.",
            prompt: PROMPT_MEMORY_EXTRACTOR,
            options: {},
            mode: "subagent",
            native: true,
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          review_worker: {
            name: "review_worker",
            mode: "subagent",
            native: true,
            hidden: true,
            options: {},
            permission: Permission.fromConfig({ "*": "deny", read: "allow" }),
          },
          summarizer_worker: {
            name: "summarizer_worker",
            mode: "subagent",
            native: true,
            hidden: true,
            options: {},
            permission: Permission.fromConfig({ "*": "deny", read: "allow", bash: "allow" }),
          },
          explainer_worker: {
            name: "explainer_worker",
            mode: "subagent",
            native: true,
            hidden: true,
            options: {},
            permission: Permission.fromConfig({ "*": "deny", read: "allow" }),
          },
          doc_worker: {
            // stratacode_change
            name: "doc_worker",
            mode: "subagent",
            native: true,
            hidden: true,
            options: {},
            permission: Permission.fromConfig({ "*": "deny", read: "allow" }),
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_SUMMARY,
          },
        }

        // stratacode_change start - rename build→code, add debug/orchestrator/ask, patch plan/explore
        StrataAgent.patchAgents(agents, defaults, user, cfg, strata)
        // stratacode_change end

        // stratacode_change start - preprocess config to remap "build" key → "code"
        const agentConfigs = StrataAgent.preprocessConfig(cfg.agent ?? {})
        for (const [key, value] of Object.entries(agentConfigs)) {
          // stratacode_change end
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          // stratacode_change start - propagate fallback_models, model_pool, and retry from config
          if (value.fallback_models?.length) item.fallback_models = value.fallback_models
          if (value.model_pool?.models?.length) item.model_pool = value.model_pool
          if (value.retry) item.retry = value.retry
          // stratacode_change end
          StrataAgent.processConfigItem(item) // stratacode_change - populate displayName from options
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          return agents[StrataAgent.resolveKey(agent)] // stratacode_change - treat "build" as "code"
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            agents,
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "ask"), "desc"], // stratacode_change - default agent is "ask"
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const effective = StrataAgent.resolveKey(c.default_agent) // stratacode_change - treat "build" as "code"
            const agent = agents[effective] // stratacode_change
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent.name
          }
          // stratacode_change start - prefer "ask" as default agent
          const ask = agents.ask
          if (ask && ask.mode !== "subagent" && ask.hidden !== true) return ask.name
          // stratacode_change end
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible.name
        })

        return {
          get,
          list,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderID; modelID: ModelID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          // stratacode_change start - enable telemetry with custom PostHog tracer
          experimental_telemetry: StrataAgent.telemetryOptions(cfg),
          // stratacode_change end
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: z.object({
            identifier: z.string(),
            whenToUse: z.string(),
            systemPrompt: z.string(),
          }),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Skill.defaultLayer),
)

// stratacode_change start - agent removal (delegated to stratacode module)
export const RemoveError = StrataAgent.RemoveError
export async function remove(name: string) {
  return StrataAgent.remove(name)
}
// stratacode_change end

// stratacode_change start - legacy promise helpers for Strata callsites
const { runPromise } = makeRuntime(Service, defaultLayer)
export const get = (agent: string) => runPromise((svc) => svc.get(agent))
export const list = () => runPromise((svc) => svc.list())
export const defaultAgent = () => runPromise((svc) => svc.defaultAgent())
// stratacode_change end

export * as Agent from "./agent"
