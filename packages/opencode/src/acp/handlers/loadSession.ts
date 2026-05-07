
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
import { Log } from "../../util"
import { pathToFileURL } from "url"
import { Filesystem } from "../../util"
import { Hash } from "@opencode-ai/shared/util/hash"
import { ACPSessionManager } from "../session"
import type { ACPConfig } from "../types"
import { Provider } from "../../provider"
import { ModelID, ProviderID } from "../../provider/schema"
import { Agent as AgentModule } from "../../agent/agent"
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
import { Agent, DEFAULT_VARIANT_VALUE, log, getContextLimit, sendUsageUpdate, init, toToolKind, toLocations, defaultModel, parseUri, getNewContent, sortProvidersByName, modelVariantsFromProviders, buildAvailableModels, formatModelIdWithVariant, buildVariantMeta, parseModelSelection, buildConfigOptions } from "../agent";

export async function loadSession(agent: Agent, params: LoadSessionRequest) {
const directory = params.cwd
const sessionId = params.sessionId

try {
  const model = await defaultModel(agent.config, directory)

  // Store ACP session state
  await agent.sessionManager.load(sessionId, params.cwd, params.mcpServers, model)

  log.info("load_session", { sessionId, mcpServers: params.mcpServers.length })

  const result = await agent.loadSessionMode({
    cwd: directory,
    mcpServers: params.mcpServers,
    sessionId,
  })

  // Replay session history
  const messages = await agent.sdk.session
    .messages(
      {
        sessionID: sessionId,
        directory,
      },
      { throwOnError: true },
    )
    .then((x) => x.data)
    .catch((err) => {
      log.error("unexpected error when fetching message", { error: err })
      return undefined
    })

  const lastUser = messages?.findLast((m) => m.info.role === "user")?.info
  if (lastUser?.role === "user") {
    result.models.currentModelId = `${lastUser.model.providerID}/${lastUser.model.modelID}`
    agent.sessionManager.setModel(sessionId, {
      providerID: ProviderID.make(lastUser.model.providerID),
      modelID: ModelID.make(lastUser.model.modelID),
    })
    if (result.modes?.availableModes.some((m) => m.id === lastUser.agent)) {
      result.modes.currentModeId = lastUser.agent
      agent.sessionManager.setMode(sessionId, lastUser.agent)
    }
    result.configOptions = buildConfigOptions({
      currentModelId: result.models.currentModelId,
      availableModels: result.models.availableModels,
      modes: result.modes,
    })
  }

  for (const msg of messages ?? []) {
    log.debug("replay message", msg)
    await agent.processMessage(msg)
  }

  await sendUsageUpdate(agent.connection, agent.sdk, sessionId, directory)

  return result
} catch (e) {
  const error = MessageV2.fromError(e, {
    providerID: ProviderID.make(agent.config.defaultModel?.providerID ?? "unknown"),
  })
  if (LoadAPIKeyError.isInstance(error)) {
    throw RequestError.authRequired()
  }
  throw e
}
}
