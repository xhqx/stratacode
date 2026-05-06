import type { MessageHandler, ProviderContext } from "../message-handlers"
import { handleForkSession } from "../fork-session"
import { Logger } from "../../stratacode/logger"
import { parseMessageFiles } from "../message-files"

export class SessionHandler implements MessageHandler {
  readonly types = [
    "sendMessage",
    "sendCommand",
    "abort",
    "revertSession",
    "unrevertSession",
    "createSession",
    "clearSession",
    "loadMessages",
    "syncSession",
    "loadSessions",
    "forkSession",
    "compact",
  ] as const

  async handle(message: any, ctx: ProviderContext): Promise<boolean> {
    switch (message.type) {
      case "sendMessage": {
        const files = parseMessageFiles(message.files)
        await ctx.handleSendMessage(
          message.text,
          typeof message.messageID === "string" ? message.messageID : undefined,
          message.sessionID,
          typeof message.draftID === "string" ? message.draftID : undefined,
          message.providerID,
          message.modelID,
          message.agent,
          message.variant,
          files,
        )
        return true
      }
      case "sendCommand": {
        const files = parseMessageFiles(message.files)
        await ctx.handleSendCommand(
          message.command,
          message.arguments,
          typeof message.messageID === "string" ? message.messageID : undefined,
          message.sessionID,
          typeof message.draftID === "string" ? message.draftID : undefined,
          message.providerID,
          message.modelID,
          message.agent,
          message.variant,
          files,
        )
        return true
      }
      case "abort":
        ctx.cancelRetry(message.sessionID ?? "")
        await ctx.handleAbort(message.sessionID)
        return true
      case "revertSession":
        ctx.handleRevertSession(message.sessionID, message.messageID).catch((e) =>
          Logger.error("StrataProvider", "handleRevertSession failed:", e),
        )
        return true
      case "unrevertSession":
        ctx.handleUnrevertSession(message.sessionID).catch((e) =>
          Logger.error("StrataProvider", "handleUnrevertSession failed:", e),
        )
        return true
      case "createSession":
        await ctx.handleCreateSession()
        return true
      case "clearSession":
        ctx.clearCurrentSession()
        return true
      case "loadMessages":
        // Don't await: allow parallel loads so rapid session switching
        // isn't blocked by slow responses for earlier sessions.
        void ctx.handleLoadMessages(message.sessionID, {
          mode: message.mode,
          before: message.before,
          limit: message.limit,
        })
        return true
      case "syncSession":
        ctx.handleSyncSession(message.sessionID, message.parentSessionID).catch((e) =>
          Logger.error("StrataProvider", "handleSyncSession failed:", e),
        )
        return true
      case "loadSessions":
        ctx.handleLoadSessions().catch((e) => Logger.error("StrataProvider", "handleLoadSessions failed:", e))
        return true
      case "forkSession":
        handleForkSession(ctx.getForkCtx(), message.sessionId, message.messageId).catch((e) =>
          Logger.error("StrataProvider", "handleForkSession failed:", e),
        )
        return true
      case "compact":
        await ctx.handleCompact(message.sessionID, message.providerID, message.modelID)
        return true
    }

    return false
  }
}
