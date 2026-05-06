import type { MessageHandler, ProviderContext } from "../message-handlers"
import {
  handleLogin,
  handleLogout,
  handleSetOrganization,
  handleRefreshProfile,
  type AuthContext,
} from "./auth"

export class AuthHandler implements MessageHandler {
  readonly types = ["login", "cancelLogin", "logout", "setOrganization", "refreshProfile"] as const
  private loginAttempt = 0

  async handle(message: any, ctx: ProviderContext): Promise<boolean> {
    switch (message.type) {
      case "login": {
        if (!ctx.isEnabled("strataAuth")) return true
        const attempt = ++this.loginAttempt
        await handleLogin(this.buildAuthContext(ctx), attempt, () => this.loginAttempt)
        return true
      }

      case "cancelLogin":
        if (!ctx.isEnabled("strataAuth")) return true
        this.loginAttempt++
        ctx.postMessage({ type: "deviceAuthCancelled" })
        return true

      case "logout":
        if (!ctx.isEnabled("strataAuth")) return true
        await handleLogout(this.buildAuthContext(ctx))
        return true

      case "setOrganization":
        if (!ctx.isEnabled("strataAuth")) return true
        if (typeof message.organizationId === "string" || message.organizationId === null) {
          await handleSetOrganization(this.buildAuthContext(ctx), message.organizationId)
        }
        return true

      case "refreshProfile":
        await handleRefreshProfile(this.buildAuthContext(ctx))
        return true
    }

    return false
  }

  private buildAuthContext(ctx: ProviderContext): AuthContext {
    return {
      client: ctx.client,
      postMessage: ctx.postMessage,
      getWorkspaceDirectory: ctx.getWorkspaceDirectory,
      disposeGlobal: ctx.disposeGlobal,
      fetchAndSendProviders: ctx.fetchAndSendProviders,
      fetchAndSendAgents: ctx.fetchAndSendAgents,
    }
  }
}
