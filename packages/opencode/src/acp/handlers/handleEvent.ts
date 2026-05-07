
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

export async function handleEvent(agent: Agent, event: Event) {
switch (event.type) {
  case "permission.asked": {
    const permission = event.properties
    const session = agent.sessionManager.tryGet(permission.sessionID)
    if (!session) return

    const prev = agent.permissionQueues.get(permission.sessionID) ?? Promise.resolve()
    const next = prev
      .then(async () => {
        const directory = session.cwd

        const res = await agent.connection
          .requestPermission({
            sessionId: permission.sessionID,
            toolCall: {
              toolCallId: permission.tool?.callID ?? permission.id,
              status: "pending",
              title: permission.permission,
              rawInput: permission.metadata,
              kind: toToolKind(permission.permission),
              locations: toLocations(permission.permission, permission.metadata),
            },
            options: agent.permissionOptions,
          })
          .catch(async (error) => {
            log.error("failed to request permission from ACP", {
              error,
              permissionID: permission.id,
              sessionID: permission.sessionID,
            })
            await agent.sdk.permission.reply({
              requestID: permission.id,
              reply: "reject",
              directory,
            })
            return undefined
          })

        if (!res) return
        if (res.outcome.outcome !== "selected") {
          await agent.sdk.permission.reply({
            requestID: permission.id,
            reply: "reject",
            directory,
          })
          return
        }

        if (res.outcome.optionId !== "reject" && permission.permission == "edit") {
          const metadata = permission.metadata || {}
          const filepath = typeof metadata["filepath"] === "string" ? metadata["filepath"] : ""
          const diff = typeof metadata["diff"] === "string" ? metadata["diff"] : ""
          const content = (await Filesystem.exists(filepath)) ? await Filesystem.readText(filepath) : ""
          const newContent = getNewContent(content, diff)

          if (newContent) {
            void agent.connection.writeTextFile({
              sessionId: session.id,
              path: filepath,
              content: newContent,
            })
          }
        }

        await agent.sdk.permission.reply({
          requestID: permission.id,
          reply: res.outcome.optionId as "once" | "always" | "reject",
          directory,
        })
      })
      .catch((error) => {
        log.error("failed to handle permission", { error, permissionID: permission.id })
      })
      .finally(() => {
        if (agent.permissionQueues.get(permission.sessionID) === next) {
          agent.permissionQueues.delete(permission.sessionID)
        }
      })
    agent.permissionQueues.set(permission.sessionID, next)
    return
  }

  case "message.part.updated": {
    log.info("message part updated", { event: event.properties })
    const props = event.properties
    const part = props.part
    const session = agent.sessionManager.tryGet(part.sessionID)
    if (!session) return
    const sessionId = session.id

    if (part.type === "tool") {
      await agent.toolStart(sessionId, part)

      switch (part.state.status) {
        case "pending":
          agent.bashSnapshots.delete(part.callID)
          return

        case "running":
          const output = agent.bashOutput(part)
          const content: ToolCallContent[] = []
          if (output) {
            const hash = Hash.fast(output)
            if (part.tool === "bash") {
              if (agent.bashSnapshots.get(part.callID) === hash) {
                await agent.connection
                  .sessionUpdate({
                    sessionId,
                    update: {
                      sessionUpdate: "tool_call_update",
                      toolCallId: part.callID,
                      status: "in_progress",
                      kind: toToolKind(part.tool),
                      title: part.tool,
                      locations: toLocations(part.tool, part.state.input),
                      rawInput: part.state.input,
                    },
                  })
                  .catch((error) => {
                    log.error("failed to send tool in_progress to ACP", { error })
                  })
                return
              }
              agent.bashSnapshots.set(part.callID, hash)
            }
            content.push({
              type: "content",
              content: {
                type: "text",
                text: output,
              },
            })
          }
          await agent.connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: part.callID,
                status: "in_progress",
                kind: toToolKind(part.tool),
                title: part.tool,
                locations: toLocations(part.tool, part.state.input),
                rawInput: part.state.input,
                ...(content.length > 0 && { content }),
              },
            })
            .catch((error) => {
              log.error("failed to send tool in_progress to ACP", { error })
            })
          return

        case "completed": {
          agent.toolStarts.delete(part.callID)
          agent.bashSnapshots.delete(part.callID)
          const kind = toToolKind(part.tool)
          const content: ToolCallContent[] = [
            {
              type: "content",
              content: {
                type: "text",
                text: part.state.output,
              },
            },
          ]

          if (kind === "edit") {
            const input = part.state.input
            const filePath = typeof input["filePath"] === "string" ? input["filePath"] : ""
            const oldText = typeof input["oldString"] === "string" ? input["oldString"] : ""
            const newText =
              typeof input["newString"] === "string"
                ? input["newString"]
                : typeof input["content"] === "string"
                  ? input["content"]
                  : ""
            content.push({
              type: "diff",
              path: filePath,
              oldText,
              newText,
            })
          }

          if (part.tool === "todowrite") {
            const parsedTodos = z.array(Todo.Info).safeParse(JSON.parse(part.state.output))
            if (parsedTodos.success) {
              await agent.connection
                .sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "plan",
                    entries: parsedTodos.data.map((todo) => {
                      const status: PlanEntry["status"] =
                        todo.status === "cancelled" ? "completed" : (todo.status as PlanEntry["status"])
                      return {
                        priority: "medium",
                        status,
                        content: todo.content,
                      }
                    }),
                  },
                })
                .catch((error) => {
                  log.error("failed to send session update for todo", { error })
                })
            } else {
              log.error("failed to parse todo output", { error: parsedTodos.error })
            }
          }

          await agent.connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: part.callID,
                status: "completed",
                kind,
                content,
                title: part.state.title,
                rawInput: part.state.input,
                rawOutput: {
                  output: part.state.output,
                  metadata: part.state.metadata,
                },
              },
            })
            .catch((error) => {
              log.error("failed to send tool completed to ACP", { error })
            })
          return
        }
        case "error":
          agent.toolStarts.delete(part.callID)
          agent.bashSnapshots.delete(part.callID)
          await agent.connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: part.callID,
                status: "failed",
                kind: toToolKind(part.tool),
                title: part.tool,
                rawInput: part.state.input,
                content: [
                  {
                    type: "content",
                    content: {
                      type: "text",
                      text: part.state.error,
                    },
                  },
                ],
                rawOutput: {
                  error: part.state.error,
                  metadata: part.state.metadata,
                },
              },
            })
            .catch((error) => {
              log.error("failed to send tool error to ACP", { error })
            })
          return
      }
    }

    // ACP clients already know the prompt they just submitted, so replaying
    // live user parts duplicates the message. We still replay user history in
    // loadSession() and forkSession() via processMessage().
    if (part.type !== "text" && part.type !== "file") return

    return
  }

  case "message.part.delta": {
    const props = event.properties
    const session = agent.sessionManager.tryGet(props.sessionID)
    if (!session) return
    const sessionId = session.id

    const message = await agent.sdk.session
      .message(
        {
          sessionID: props.sessionID,
          messageID: props.messageID,
          directory: session.cwd,
        },
        { throwOnError: true },
      )
      .then((x) => x.data)
      .catch((error) => {
        log.error("unexpected error when fetching message", { error })
        return undefined
      })

    if (!message || message.info.role !== "assistant") return

    const part = message.parts.find((p) => p.id === props.partID)
    if (!part) return

    if (part.type === "text" && props.field === "text" && part.ignored !== true) {
      await agent.connection
        .sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: props.messageID,
            content: {
              type: "text",
              text: props.delta,
            },
          },
        })
        .catch((error) => {
          log.error("failed to send text delta to ACP", { error })
        })
      return
    }

    if (part.type === "reasoning" && props.field === "text") {
      await agent.connection
        .sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_thought_chunk",
            messageId: props.messageID,
            content: {
              type: "text",
              text: props.delta,
            },
          },
        })
        .catch((error) => {
          log.error("failed to send reasoning delta to ACP", { error })
        })
    }
    return
  }
}
}
