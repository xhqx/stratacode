import {
  RequestError,
  type Agent as ACPAgent,
  type AgentSideConnection,
  type AuthenticateRequest,
  type AuthMethod,
  type CancelNotification,
  type ForkSessionRequest,
  type ForkSessionResponse,
  type InitializeRequest,
  type InitializeResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type NewSessionRequest,
  type PermissionOption,
  type PlanEntry,
  type PromptRequest,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type Role,
  type SessionInfo,
  type SetSessionModelRequest,
  type SessionConfigOption,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type ToolCallContent,
  type ToolKind,
  type Usage,
} from "@agentclientprotocol/sdk"

import { Log } from "../util"
import { pathToFileURL } from "url"
import { Filesystem } from "../util"
import { Hash } from "@opencode-ai/shared/util/hash"
import { ACPSessionManager } from "./session"
import type { ACPConfig } from "./types"
import { Provider } from "../provider"
import { ModelID, ProviderID } from "../provider/schema"
import { Agent as AgentModule } from "../agent/agent"
import { AppRuntime } from "@/effect/app-runtime"
import { Installation } from "@/installation"
import { MessageV2 } from "@/session/message-v2"
import { Config } from "@/config"
import { ConfigMCP } from "@/config/mcp"
import { Todo } from "@/session/todo"
import { z } from "zod"
import { LoadAPIKeyError } from "ai"
import type { AssistantMessage, Event, StrataClient, SessionMessageResponse, ToolPart } from "@stratacode/sdk/v2"
import { applyPatch } from "diff"
import { InstallationVersion } from "@/installation/version"

import { fetchDefaultModel } from "@stratacode/strata-gateway"
import { handleEvent } from "./handlers/handleEvent";
import { initialize } from "./handlers/initialize";
import { loadSession } from "./handlers/loadSession";
import { listSessions } from "./handlers/listSessions";
import { unstable_forkSession } from "./handlers/unstable_forkSession";
import { processMessage } from "./handlers/processMessage";
import { loadSessionMode } from "./handlers/loadSessionMode";
import { prompt } from "./handlers/prompt";

type ModeOption = { id: string; name: string; description?: string }
type ModelOption = { modelId: string; name: string }

export const DEFAULT_VARIANT_VALUE = "default"

export const log = Log.create({ service: "acp-agent" })

export async function getContextLimit(
  sdk: StrataClient,
  providerID: ProviderID,
  modelID: ModelID,
  directory: string,
): Promise<number | null> {
  const providers = await sdk.config
    .providers({ directory })
    .then((x) => x.data?.providers ?? [])
    .catch((error) => {
      log.error("failed to get providers for context limit", { error })
      return []
    })

  const provider = providers.find((p) => p.id === providerID)
  const model = provider?.models[modelID]
  return model?.limit.context ?? null
}

export async function sendUsageUpdate(
  connection: AgentSideConnection,
  sdk: StrataClient,
  sessionID: string,
  directory: string,
): Promise<void> {
  const messages = await sdk.session
    .messages({ sessionID, directory }, { throwOnError: true })
    .then((x) => x.data)
    .catch((error) => {
      log.error("failed to fetch messages for usage update", { error })
      return undefined
    })

  if (!messages) return

  const assistantMessages = messages.filter(
    (m): m is { info: AssistantMessage; parts: SessionMessageResponse["parts"] } => m.info.role === "assistant",
  )

  const lastAssistant = assistantMessages[assistantMessages.length - 1]
  if (!lastAssistant) return

  const msg = lastAssistant.info
  if (!msg.providerID || !msg.modelID) return
  const size = await getContextLimit(sdk, ProviderID.make(msg.providerID), ModelID.make(msg.modelID), directory)

  if (!size) {
    // Cannot calculate usage without known context size
    return
  }

  const used = msg.tokens.input + (msg.tokens.cache?.read ?? 0)
  const totalCost = assistantMessages.reduce((sum, m) => sum + m.info.cost, 0)

  await connection
    .sessionUpdate({
      sessionId: sessionID,
      update: {
        sessionUpdate: "usage_update",
        used,
        size,
        cost: { amount: totalCost, currency: "USD" },
      },
    })
    .catch((error) => {
      log.error("failed to send usage update", { error })
    })
}

export async function init({ sdk: _sdk }: { sdk: StrataClient }) {
  return {
    create: (connection: AgentSideConnection, fullConfig: ACPConfig) => {
      return new Agent(connection, fullConfig)
    },
  }
}

export class Agent implements ACPAgent {
  connection: AgentSideConnection
  config: ACPConfig
  sdk: StrataClient
  sessionManager: ACPSessionManager
  eventAbort = new AbortController()
  eventStarted = false
  bashSnapshots = new Map<string, string>()
  toolStarts = new Set<string>()
  permissionQueues = new Map<string, Promise<void>>()
  permissionOptions: PermissionOption[] = [
    { optionId: "once", kind: "allow_once", name: "Allow once" },
    { optionId: "always", kind: "allow_always", name: "Always allow" },
    { optionId: "reject", kind: "reject_once", name: "Reject" },
  ]

  constructor(connection: AgentSideConnection, config: ACPConfig) {
    this.connection = connection
    this.config = config
    this.sdk = config.sdk
    this.sessionManager = new ACPSessionManager(this.sdk)
    this.startEventSubscription()
  }

  startEventSubscription() {
    if (this.eventStarted) return
    this.eventStarted = true
    this.runEventSubscription().catch((error) => {
      if (this.eventAbort.signal.aborted) return
      log.error("event subscription failed", { error })
    })
  }

  async runEventSubscription() {
    while (true) {
      if (this.eventAbort.signal.aborted) return
      const events = await this.sdk.global.event({
        signal: this.eventAbort.signal,
      })
      for await (const event of events.stream) {
        if (this.eventAbort.signal.aborted) return
        const payload = event?.payload
        if (!payload) continue
        await this.handleEvent(payload as Event).catch((error) => {
          log.error("failed to handle event", { error, type: payload.type })
        })
      }
    }
  }

  async handleEvent(event: Event) {
      return handleEvent(this, event);
  }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
      return initialize(this, params);
  }

  async authenticate(_params: AuthenticateRequest) {
    throw new Error("Authentication not implemented")
  }

  async newSession(params: NewSessionRequest) {
    const directory = params.cwd
    try {
      const model = await defaultModel(this.config, directory)

      // Store ACP session state
      const state = await this.sessionManager.create(params.cwd, params.mcpServers, model)
      const sessionId = state.id

      log.info("creating_session", { sessionId, mcpServers: params.mcpServers.length })

      const load = await this.loadSessionMode({
        cwd: directory,
        mcpServers: params.mcpServers,
        sessionId,
      })

      return {
        sessionId,
        configOptions: load.configOptions,
        models: load.models,
        modes: load.modes,
        _meta: load._meta,
      }
    } catch (e) {
      const error = MessageV2.fromError(e, {
        providerID: ProviderID.make(this.config.defaultModel?.providerID ?? "unknown"),
      })
      if (LoadAPIKeyError.isInstance(error)) {
        throw RequestError.authRequired()
      }
      throw e
    }
  }

  async loadSession(params: LoadSessionRequest) {
      return loadSession(this, params);
  }

  async listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
      return listSessions(this, params);
  }

  async unstable_forkSession(params: ForkSessionRequest): Promise<ForkSessionResponse> {
      return unstable_forkSession(this, params);
  }

  async unstable_resumeSession(params: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    const directory = params.cwd
    const sessionId = params.sessionId
    const mcpServers = params.mcpServers ?? []

    try {
      const model = await defaultModel(this.config, directory)
      await this.sessionManager.load(sessionId, directory, mcpServers, model)

      log.info("resume_session", { sessionId, mcpServers: mcpServers.length })

      const result = await this.loadSessionMode({
        cwd: directory,
        mcpServers,
        sessionId,
      })

      await sendUsageUpdate(this.connection, this.sdk, sessionId, directory)

      return result
    } catch (e) {
      const error = MessageV2.fromError(e, {
        providerID: ProviderID.make(this.config.defaultModel?.providerID ?? "unknown"),
      })
      if (LoadAPIKeyError.isInstance(error)) {
        throw RequestError.authRequired()
      }
      throw e
    }
  }

  async processMessage(message: SessionMessageResponse) {
      return processMessage(this, message);
  }

  bashOutput(part: ToolPart) {
    if (part.tool !== "bash") return
    if (!("metadata" in part.state) || !part.state.metadata || typeof part.state.metadata !== "object") return
    const output = part.state.metadata["output"]
    if (typeof output !== "string") return
    return output
  }

  async toolStart(sessionId: string, part: ToolPart) {
    if (this.toolStarts.has(part.callID)) return
    this.toolStarts.add(part.callID)
    await this.connection
      .sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: part.callID,
          title: part.tool,
          kind: toToolKind(part.tool),
          status: "pending",
          locations: [],
          rawInput: {},
        },
      })
      .catch((error) => {
        log.error("failed to send tool pending to ACP", { error })
      })
  }

  async loadAvailableModes(directory: string): Promise<ModeOption[]> {
    const agents = await this.config.sdk.app
      .agents(
        {
          directory,
        },
        { throwOnError: true },
      )
      .then((resp) => resp.data!)

    return agents
      .filter((agent) => agent.mode !== "subagent" && !agent.hidden)
      .map((agent) => ({
        id: agent.name,
        name: agent.name,
        description: agent.description,
      }))
  }

  async resolveModeState(
    directory: string,
    sessionId: string,
  ): Promise<{ availableModes: ModeOption[]; currentModeId?: string }> {
    const availableModes = await this.loadAvailableModes(directory)
    const currentModeId =
      this.sessionManager.get(sessionId).modeId ||
      (await (async () => {
        if (!availableModes.length) return undefined
        const defaultAgentName = await AppRuntime.runPromise(AgentModule.Service.use((svc) => svc.defaultAgent()))
        const resolvedModeId = availableModes.find((mode) => mode.name === defaultAgentName)?.id ?? availableModes[0].id
        this.sessionManager.setMode(sessionId, resolvedModeId)
        return resolvedModeId
      })())

    return { availableModes, currentModeId }
  }

  async loadSessionMode(params: LoadSessionRequest) {
      return loadSessionMode(this, params);
  }

  async unstable_setSessionModel(params: SetSessionModelRequest) {
    const session = this.sessionManager.get(params.sessionId)
    const providers = await this.sdk.config
      .providers({ directory: session.cwd }, { throwOnError: true })
      .then((x) => x.data!.providers)

    const selection = parseModelSelection(params.modelId, providers)
    this.sessionManager.setModel(session.id, selection.model)
    this.sessionManager.setVariant(session.id, selection.variant)

    const entries = sortProvidersByName(providers)
    const availableVariants = modelVariantsFromProviders(entries, selection.model)

    return {
      _meta: buildVariantMeta({
        model: selection.model,
        variant: selection.variant,
        availableVariants,
      }),
    }
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse | void> {
    const session = this.sessionManager.get(params.sessionId)
    const availableModes = await this.loadAvailableModes(session.cwd)
    if (!availableModes.some((mode) => mode.id === params.modeId)) {
      throw new Error(`Agent not found: ${params.modeId}`)
    }
    this.sessionManager.setMode(params.sessionId, params.modeId)
  }

  async setSessionConfigOption(params: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse> {
    const session = this.sessionManager.get(params.sessionId)
    const providers = await this.sdk.config
      .providers({ directory: session.cwd }, { throwOnError: true })
      .then((x) => x.data!.providers)
    const entries = sortProvidersByName(providers)

    if (params.configId === "model") {
      if (typeof params.value !== "string") throw RequestError.invalidParams("model value must be a string")
      const selection = parseModelSelection(params.value, providers)
      this.sessionManager.setModel(session.id, selection.model)
      this.sessionManager.setVariant(session.id, selection.variant)
    } else if (params.configId === "mode") {
      if (typeof params.value !== "string") throw RequestError.invalidParams("mode value must be a string")
      const availableModes = await this.loadAvailableModes(session.cwd)
      if (!availableModes.some((mode) => mode.id === params.value)) {
        throw RequestError.invalidParams(JSON.stringify({ error: `Mode not found: ${params.value}` }))
      }
      this.sessionManager.setMode(session.id, params.value)
    } else {
      throw RequestError.invalidParams(JSON.stringify({ error: `Unknown config option: ${params.configId}` }))
    }

    const updatedSession = this.sessionManager.get(session.id)
    const model = updatedSession.model ?? (await defaultModel(this.config, session.cwd))
    const availableVariants = modelVariantsFromProviders(entries, model)
    const currentModelId = formatModelIdWithVariant(model, updatedSession.variant, availableVariants, true)
    const availableModels = buildAvailableModels(entries, { includeVariants: true })
    const modeState = await this.resolveModeState(session.cwd, session.id)
    const modes = modeState.currentModeId
      ? { availableModes: modeState.availableModes, currentModeId: modeState.currentModeId }
      : undefined

    return {
      configOptions: buildConfigOptions({ currentModelId, availableModels, modes }),
    }
  }

  async prompt(params: PromptRequest) {
      return prompt(this, params);
  }

  async cancel(params: CancelNotification) {
    const session = this.sessionManager.get(params.sessionId)
    await this.config.sdk.session.abort(
      {
        sessionID: params.sessionId,
        directory: session.cwd,
      },
      { throwOnError: true },
    )
  }
}

export function toToolKind(toolName: string): ToolKind {
  const tool = toolName.toLocaleLowerCase()
  switch (tool) {
    case "bash":
      return "execute"
    case "webfetch":
      return "fetch"

    case "edit":
    case "patch":
    case "write":
      return "edit"

    case "grep":
    case "glob":
    case "context7_resolve_library_id":
    case "context7_get_library_docs":
      return "search"

    case "read":
      return "read"

    default:
      return "other"
  }
}

export function toLocations(toolName: string, input: Record<string, any>): { path: string }[] {
  const tool = toolName.toLocaleLowerCase()
  switch (tool) {
    case "read":
    case "edit":
    case "write":
      return input["filePath"] ? [{ path: input["filePath"] }] : []
    case "glob":
    case "grep":
      return input["path"] ? [{ path: input["path"] }] : []
    case "bash":
      return []
    default:
      return []
  }
}

export async function defaultModel(config: ACPConfig, cwd?: string): Promise<{ providerID: ProviderID; modelID: ModelID }> {
  const sdk = config.sdk
  const configured = config.defaultModel
  if (configured) return configured

  const directory = cwd ?? process.cwd()

  const specified = await sdk.config
    .get({ directory }, { throwOnError: true })
    .then((resp) => {
      const cfg = resp.data
      if (!cfg || !cfg.model) return undefined
      return Provider.parseModel(cfg.model)
    })
    .catch((error) => {
      log.error("failed to load user config for default model", { error })
      return undefined
    })

  const providers = await sdk.config
    .providers({ directory }, { throwOnError: true })
    .then((x) => x.data?.providers ?? [])
    .catch((error) => {
      log.error("failed to list providers for default model", { error })
      return []
    })

  if (specified && providers.length) {
    const provider = providers.find((p) => p.id === specified.providerID)
    if (provider && provider.models[specified.modelID]) return specified
  }

  if (specified && !providers.length) return specified

  // stratacode_change start
  const strataProvider = providers.find((p) => p.id === "strata")
  if (strataProvider) {
    const [best] = Provider.sort(Object.values(strataProvider.models))
    if (best) {
      return {
        providerID: ProviderID.make(best.providerID),
        modelID: ModelID.make(best.id),
      }
    }
  }
  // stratacode_change end

  const models = providers.flatMap((p) => Object.values(p.models))
  const [best] = Provider.sort(models)
  if (best) {
    return {
      providerID: ProviderID.make(best.providerID),
      modelID: ModelID.make(best.id),
    }
  }

  if (specified) return specified

  // stratacode_change start
  // Only fall back to the Strata provider if it was present in the available
  // providers list. When teams configure enabled_providers to use only their
  // own models, this prevents silently routing requests to an external API.
  // Note: LiteLLM / custom provider users won't reach here — the function
  // returns earlier via `specified` (config.model) or the sorted providers list.
  if (providers.some((p) => p.id === "strata")) {
    const freeModel = await fetchDefaultModel()
    return { providerID: ProviderID.strata, modelID: ModelID.make(freeModel) }
  }
  throw new Error("no model available: no providers are configured and no default model is set")
  // stratacode_change end
}

export function parseUri(
  uri: string,
): { type: "file"; url: string; filename: string; mime: string } | { type: "text"; text: string } {
  try {
    if (uri.startsWith("file://")) {
      const path = uri.slice(7)
      const name = path.split("/").pop() || path
      return {
        type: "file",
        url: uri,
        filename: name,
        mime: "text/plain",
      }
    }
    if (uri.startsWith("zed://")) {
      const url = new URL(uri)
      const path = url.searchParams.get("path")
      if (path) {
        const name = path.split("/").pop() || path
        return {
          type: "file",
          url: pathToFileURL(path).href,
          filename: name,
          mime: "text/plain",
        }
      }
    }
    return {
      type: "text",
      text: uri,
    }
  } catch {
    return {
      type: "text",
      text: uri,
    }
  }
}

export function getNewContent(fileOriginal: string, unifiedDiff: string): string | undefined {
  const result = applyPatch(fileOriginal, unifiedDiff)
  if (result === false) {
    log.error("Failed to apply unified diff (context mismatch)")
    return undefined
  }
  return result
}

export function sortProvidersByName<T extends { name: string }>(providers: T[]): T[] {
  return [...providers].sort((a, b) => {
    const nameA = a.name.toLowerCase()
    const nameB = b.name.toLowerCase()
    if (nameA < nameB) return -1
    if (nameA > nameB) return 1
    return 0
  })
}

export function modelVariantsFromProviders(
  providers: Array<{ id: string; models: Record<string, { variants?: Record<string, any> }> }>,
  model: { providerID: ProviderID; modelID: ModelID },
): string[] {
  const provider = providers.find((entry) => entry.id === model.providerID)
  if (!provider) return []
  const modelInfo = provider.models[model.modelID]
  if (!modelInfo?.variants) return []
  return Object.keys(modelInfo.variants)
}

export function buildAvailableModels(
  providers: Array<{ id: string; name: string; models: Record<string, any> }>,
  options: { includeVariants?: boolean } = {},
): ModelOption[] {
  const includeVariants = options.includeVariants ?? false
  return providers.flatMap((provider) => {
    const unsorted: Array<{ id: string; name: string; variants?: Record<string, any> }> = Object.values(provider.models)
    const models = Provider.sort(unsorted)
    return models.flatMap((model) => {
      const base: ModelOption = {
        modelId: `${provider.id}/${model.id}`,
        name: `${provider.name}/${model.name}`,
      }
      if (!includeVariants || !model.variants) return [base]
      const variants = Object.keys(model.variants).filter((variant) => variant !== DEFAULT_VARIANT_VALUE)
      const variantOptions = variants.map((variant) => ({
        modelId: `${provider.id}/${model.id}/${variant}`,
        name: `${provider.name}/${model.name} (${variant})`,
      }))
      return [base, ...variantOptions]
    })
  })
}

export function formatModelIdWithVariant(
  model: { providerID: ProviderID; modelID: ModelID },
  variant: string | undefined,
  availableVariants: string[],
  includeVariant: boolean,
) {
  const base = `${model.providerID}/${model.modelID}`
  if (!includeVariant || !variant || !availableVariants.includes(variant)) return base
  return `${base}/${variant}`
}

export function buildVariantMeta(input: {
  model: { providerID: ProviderID; modelID: ModelID }
  variant?: string
  availableVariants: string[]
}) {
  return {
    opencode: {
      modelId: `${input.model.providerID}/${input.model.modelID}`,
      variant: input.variant ?? null,
      availableVariants: input.availableVariants,
    },
  }
}

export function parseModelSelection(
  modelId: string,
  providers: Array<{ id: string; models: Record<string, { variants?: Record<string, any> }> }>,
): { model: { providerID: ProviderID; modelID: ModelID }; variant?: string } {
  const parsed = Provider.parseModel(modelId)
  const provider = providers.find((p) => p.id === parsed.providerID)
  if (!provider) {
    return { model: parsed, variant: undefined }
  }

  // Check if modelID exists directly
  if (provider.models[parsed.modelID]) {
    return { model: parsed, variant: undefined }
  }

  // Try to extract variant from end of modelID (e.g., "claude-sonnet-4/high" -> model: "claude-sonnet-4", variant: "high")
  const segments = parsed.modelID.split("/")
  if (segments.length > 1) {
    const candidateVariant = segments[segments.length - 1]
    const baseModelId = segments.slice(0, -1).join("/")
    const baseModelInfo = provider.models[baseModelId]
    if (baseModelInfo?.variants && candidateVariant in baseModelInfo.variants) {
      return {
        model: { providerID: parsed.providerID, modelID: ModelID.make(baseModelId) },
        variant: candidateVariant,
      }
    }
  }

  return { model: parsed, variant: undefined }
}

export function buildConfigOptions(input: {
  currentModelId: string
  availableModels: ModelOption[]
  modes?: { availableModes: ModeOption[]; currentModeId: string } | undefined
}): SessionConfigOption[] {
  const options: SessionConfigOption[] = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: input.currentModelId,
      options: input.availableModels.map((m) => ({ value: m.modelId, name: m.name })),
    },
  ]
  if (input.modes) {
    options.push({
      id: "mode",
      name: "Session Mode",
      category: "mode",
      type: "select",
      currentValue: input.modes.currentModeId,
      options: input.modes.availableModes.map((m) => ({
        value: m.id,
        name: m.name,
        ...(m.description ? { description: m.description } : {}),
      })),
    })
  }
  return options
}

export * as ACP from "./agent"
