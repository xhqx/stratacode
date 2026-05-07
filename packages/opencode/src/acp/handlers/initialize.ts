
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

export async function initialize(agent: Agent, params: InitializeRequest): Promise<InitializeResponse> {
log.info("initialize", { protocolVersion: params.protocolVersion })

// stratacode_change start
const authMethod: AuthMethod = {
  description: "Run `strata auth login` in the terminal",
  name: "Login with Strata",
  id: "strata-login",
}
// stratacode_change end

// If client supports terminal-auth capability, use that instead.
if (params.clientCapabilities?._meta?.["terminal-auth"] === true) {
  authMethod._meta = {
    "terminal-auth": {
      command: "opencode",
      args: ["auth", "login"],
      label: "Strata Login", // stratacode_change
    },
  }
}

return {
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    mcpCapabilities: {
      http: true,
      sse: true,
    },
    promptCapabilities: {
      embeddedContext: true,
      image: true,
    },
    sessionCapabilities: {
      fork: {},
      list: {},
      resume: {},
    },
  },
  authMethods: [authMethod],
  agentInfo: {
    name: "Strata", // stratacode_change
    version: InstallationVersion,
  },
}
}
