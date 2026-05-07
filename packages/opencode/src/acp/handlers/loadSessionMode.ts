
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

export async function loadSessionMode(agent: Agent, params: LoadSessionRequest) {
const directory = params.cwd
const model = await defaultModel(agent.config, directory)
const sessionId = params.sessionId

const providers = await agent.sdk.config.providers({ directory }).then((x) => x.data!.providers)
const entries = sortProvidersByName(providers)
const availableVariants = modelVariantsFromProviders(entries, model)
const currentVariant = agent.sessionManager.getVariant(sessionId)
if (currentVariant && !availableVariants.includes(currentVariant)) {
  agent.sessionManager.setVariant(sessionId, undefined)
}
const availableModels = buildAvailableModels(entries, { includeVariants: true })
const modeState = await agent.resolveModeState(directory, sessionId)
const currentModeId = modeState.currentModeId
const modes = currentModeId
  ? {
      availableModes: modeState.availableModes,
      currentModeId,
    }
  : undefined

const commands = await agent.config.sdk.command
  .list(
    {
      directory,
    },
    { throwOnError: true },
  )
  .then((resp) => resp.data!)

const availableCommands = commands.map((command) => ({
  name: command.name,
  description: command.description ?? "",
}))
const names = new Set(availableCommands.map((c) => c.name))
if (!names.has("compact"))
  availableCommands.push({
    name: "compact",
    description: "compact the session",
  })

const mcpServers: Record<string, ConfigMCP.Info> = {}
for (const server of params.mcpServers) {
  if ("type" in server) {
    mcpServers[server.name] = {
      url: server.url,
      headers: server.headers.reduce<Record<string, string>>((acc, { name, value }) => {
        acc[name] = value
        return acc
      }, {}),
      type: "remote",
    }
  } else {
    mcpServers[server.name] = {
      type: "local",
      command: [server.command, ...server.args],
      environment: server.env.reduce<Record<string, string>>((acc, { name, value }) => {
        acc[name] = value
        return acc
      }, {}),
    }
  }
}

await Promise.all(
  Object.entries(mcpServers).map(async ([key, mcp]) => {
    await agent.sdk.mcp
      .add(
        {
          directory,
          name: key,
          config: mcp,
        },
        { throwOnError: true },
      )
      .catch((error) => {
        log.error("failed to add mcp server", { name: key, error })
      })
  }),
)

setTimeout(() => {
  void agent.connection.sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: "available_commands_update",
      availableCommands,
    },
  })
}, 0)

return {
  sessionId,
  models: {
    currentModelId: formatModelIdWithVariant(model, currentVariant, availableVariants, true),
    availableModels,
  },
  modes,
  configOptions: buildConfigOptions({
    currentModelId: formatModelIdWithVariant(model, currentVariant, availableVariants, true),
    availableModels,
    modes,
  }),
  _meta: buildVariantMeta({
    model,
    variant: agent.sessionManager.getVariant(sessionId),
    availableVariants,
  }),
}
}
