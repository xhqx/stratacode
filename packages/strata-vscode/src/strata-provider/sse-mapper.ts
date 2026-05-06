import type { Event } from "@stratacode/sdk/v2/client"
import type { WebviewMessage } from "../strata-provider-utils"
import { sessionToWebview } from "../strata-provider-utils"

type MapperFn<T extends Event["type"]> = (
  event: Extract<Event, { type: T }>,
  sessionID: string | undefined
) => WebviewMessage | null

const mappers: {
  [K in Event["type"]]?: MapperFn<K>
} = {
  "message.part.updated": (event, sessionID) => {
    const part = event.properties.part as { messageID?: string; sessionID?: string }
    if (!sessionID) return null
    return {
      type: "partUpdated",
      sessionID,
      messageID: part.messageID || "",
      part: event.properties.part,
    }
  },
  "message.part.delta": (event, sessionID) => {
    const props = event.properties
    if (!sessionID) return null
    return {
      type: "partUpdated",
      sessionID: props.sessionID,
      messageID: props.messageID,
      part: { id: props.partID, type: "text", messageID: props.messageID, text: props.delta },
      delta: { type: "text-delta", textDelta: props.delta },
    }
  },
  "message.updated": (event) => {
    const info = event.properties.info
    return {
      type: "messageCreated",
      message: {
        ...info,
        createdAt: new Date(info.time.created).toISOString(),
      },
    }
  },
  "message.removed": (event) => {
    const props = event.properties as { sessionID: string; messageID: string }
    return {
      type: "messageRemoved",
      sessionID: props.sessionID,
      messageID: props.messageID,
    }
  },
  "session.status": (event) => {
    const info = event.properties.status
    const status = info.type as string
    const extra =
      status === "retry" && info.type === "retry"
        ? {
            attempt: info.attempt,
            message: info.message,
            next: info.next,
          }
        : status === "offline"
          ? { message: (info as unknown as Record<string, unknown>).message as string }
          : {}
    return {
      type: "sessionStatus" as const,
      sessionID: event.properties.sessionID,
      status,
      ...extra,
    }
  },
  "permission.asked": (event) => ({
    type: "permissionRequest",
    permission: {
      id: event.properties.id,
      sessionID: event.properties.sessionID,
      toolName: event.properties.permission,
      patterns: event.properties.patterns ?? [],
      always: event.properties.always ?? [],
      args: event.properties.metadata,
      message: `Permission required: ${event.properties.permission}`,
      tool: event.properties.tool,
      agent: event.properties.agent,
    },
  }),
  "permission.replied": (event) => ({
    type: "permissionResolved",
    permissionID: event.properties.requestID,
  }),
  "todo.updated": (event) => ({
    type: "todoUpdated",
    sessionID: event.properties.sessionID,
    items: event.properties.todos,
  }),
  "question.asked": (event) => ({
    type: "questionRequest",
    question: {
      id: event.properties.id,
      sessionID: event.properties.sessionID,
      questions: event.properties.questions,
      blocking: event.properties.blocking,
      tool: event.properties.tool,
    },
  }),
  "question.replied": (event) => ({
    type: "questionResolved",
    requestID: event.properties.requestID,
  }),
  "question.rejected": (event) => ({
    type: "questionResolved",
    requestID: event.properties.requestID,
  }),
  "suggestion.shown": (event) => ({
    type: "suggestionRequest",
    suggestion: {
      id: event.properties.id,
      sessionID: event.properties.sessionID,
      text: event.properties.text,
      actions: event.properties.actions,
      blocking: event.properties.blocking,
      tool: event.properties.tool,
    },
  }),
  "suggestion.accepted": (event) => ({
    type: "suggestionResolved",
    requestID: event.properties.requestID,
  }),
  "suggestion.dismissed": (event) => ({
    type: "suggestionResolved",
    requestID: event.properties.requestID,
  }),
  "session.error": (event) => ({
    type: "sessionError",
    sessionID: event.properties.sessionID,
    error: event.properties.error,
  }),
  "session.created": (event) => ({
    type: "sessionCreated",
    session: sessionToWebview(event.properties.info),
  }),
  "session.updated": (event) => ({
    type: "sessionUpdated",
    session: sessionToWebview(event.properties.info),
  }),
  "indexing.status": (event) => ({
    type: "indexingStatusLoaded",
    status: event.properties.status,
  }),
}

export function mapSSEEventToWebviewMessage(event: Event, sessionID: string | undefined): WebviewMessage | null {
  const mapper = mappers[event.type] as MapperFn<typeof event.type> | undefined
  return mapper ? mapper(event as any, sessionID) : null
}
