
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

export async function listSessions(agent: Agent, params: ListSessionsRequest): Promise<ListSessionsResponse> {
try {
  const cursor = params.cursor ? Number(params.cursor) : undefined
  const limit = 100

  const sessions = await agent.sdk.session
    .list(
      {
        directory: params.cwd ?? undefined,
        roots: true,
      },
      { throwOnError: true },
    )
    .then((x) => x.data ?? [])

  const sorted = sessions.toSorted((a, b) => b.time.updated - a.time.updated)
  const filtered = cursor ? sorted.filter((s) => s.time.updated < cursor) : sorted
  const page = filtered.slice(0, limit)

  const entries: SessionInfo[] = page.map((session) => ({
    sessionId: session.id,
    cwd: session.directory,
    title: session.title,
    updatedAt: new Date(session.time.updated).toISOString(),
  }))

  const last = page[page.length - 1]
  const next = filtered.length > limit && last ? String(last.time.updated) : undefined

  const response: ListSessionsResponse = {
    sessions: entries,
  }
  if (next) response.nextCursor = next
  return response
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
