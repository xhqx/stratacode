import type { MessageHandler, ProviderContext } from "../message-handlers"
import {
  buildActionContext,
  connectProvider,
  authorizeProviderOAuth,
  completeProviderOAuth,
  disconnectProvider,
  saveCustomProvider,
} from "../../provider-actions"
import { fetchOpenAIModels, FetchModelsError } from "../../shared/fetch-models"
import { getErrorMessage } from "../../strata-provider-utils"

export class ProviderHandler implements MessageHandler {
  readonly types = [
    "requestProviders",
    "connectProvider",
    "authorizeProviderOAuth",
    "completeProviderOAuth",
    "disconnectProvider",
    "saveCustomProvider",
    "fetchCustomProviderModels",
    "testAcpConnection",
  ] as const

  async handle(message: any, ctx: ProviderContext): Promise<boolean> {
    switch (message.type) {
      case "requestProviders":
        ctx.fetchAndSendProviders().catch((e) => console.error("fetchAndSendProviders failed:", e))
        this.sendAcpProviderMeta(ctx).catch((e) => console.error("sendAcpProviderMeta failed:", e))
        return true

      case "connectProvider":
      case "authorizeProviderOAuth":
      case "completeProviderOAuth":
      case "disconnectProvider":
      case "saveCustomProvider":
        await this.handleProviderAction(message, ctx)
        return true

      case "fetchCustomProviderModels":
        this.handleFetchCustomProviderModels(message, ctx).catch((e) =>
          console.error("fetchCustomProviderModels failed:", e),
        )
        return true

      case "testAcpConnection":
        this.handleTestAcpConnection(message, ctx).catch((e) =>
          console.error("testAcpConnection failed:", e),
        )
        return true
    }

    return false
  }

  private async sendAcpProviderMeta(ctx: ProviderContext): Promise<void> {
    try {
      const PREDEFINED = require("../../../../opencode/src/stratacode/acp-client/registry").PREDEFINED
      const configObj = ctx.getCachedConfigMessage?.() as any
      const userConf = configObj?.config?.acp_providers || {}
      
      const providers: Record<string, any> = {}
      for (const [key, preset] of Object.entries(PREDEFINED)) {
        const p = preset as any
        const cfg = userConf[key] || {}
        
        providers[key] = {
          name: p.name,
          description: p.description,
          icon: p.icon,
          defaultModel: p.default,
          enabled: cfg.enabled === true,
          configuredModel: cfg.model ?? p.default,
          status: "disconnected",
          staticModels: p.models,
          liveModels: p.models,
          env: p.env,
          installed: true,
        }
      }

      ctx.postMessage({ type: "acpProviderMeta", providers })
    } catch (e) {
      console.error("Failed to send ACP provider meta:", e)
    }
  }

  private async handleProviderAction(msg: Record<string, unknown>, ctx: ProviderContext): Promise<void> {
    const rid = typeof msg.requestId === "string" ? msg.requestId : ""
    const pid = typeof msg.providerID === "string" ? msg.providerID : ""
    if (!rid || !pid) return

    if (!ctx.client) {
      const action =
        msg.type === "disconnectProvider"
          ? "disconnect"
          : msg.type === "authorizeProviderOAuth"
            ? "authorize"
            : "connect"
      ctx.postMessage({
        type: "providerActionError",
        requestId: rid,
        providerID: pid,
        action,
        message: "Not connected to CLI backend",
      })
      return
    }

    const actionCtx = buildActionContext(
      ctx.client,
      (m: any) => ctx.postMessage(m),
      getErrorMessage,
      ctx.getWorkspaceDirectory(),
      () => ctx.fetchAndSendProviders(),
    )

    // A getter/setter workaround for cachedConfigMessage (used to avoid full config refetches in some cases)
    // We could either migrate cachedConfigMessage out of StrataProvider entirely, or provide a setter.
    // Given the extraction goal, we can just use the provided invalidateConfig or fetchAndSendConfig?
    // Wait, let's see what disconnectProviderAction expects for the set function.
    // It expects a function that takes `unknown` and updates the cache.
    // For now we can pass a no-op setter, but the side-effect is that config is fully re-fetched instead of mutated inline.
    // Let's expose setCachedConfigMessage on ProviderContext, or just rely on fetchAndSendConfig.
    // Let's check how it's used: disconnectProviderAction mutates the config and calls set(config).
    // Let's expose getCachedConfigMessage / setCachedConfigMessage in ProviderContext.
    const getCachedConfig = () => ctx.getCachedConfigMessage?.()
    const setCachedConfig = (m: any) => ctx.setCachedConfigMessage?.(m)

    const method = typeof msg.method === "number" ? msg.method : 0
    const key = typeof msg.apiKey === "string" ? msg.apiKey : undefined
    const keyChanged = msg.apiKeyChanged === true
    const code = typeof msg.code === "string" ? msg.code : undefined
    const config = msg.config && typeof msg.config === "object" ? (msg.config as Record<string, unknown>) : undefined

    if (msg.type === "connectProvider" && key) return connectProvider(actionCtx, rid, pid, key)
    if (msg.type === "authorizeProviderOAuth") return authorizeProviderOAuth(actionCtx, rid, pid, method)
    if (msg.type === "completeProviderOAuth") return completeProviderOAuth(actionCtx, rid, pid, method, code)
    if (msg.type === "disconnectProvider") return disconnectProvider(actionCtx, rid, pid, getCachedConfig(), setCachedConfig)
    if (msg.type === "saveCustomProvider" && config)
      return saveCustomProvider(actionCtx, rid, pid, config, key, keyChanged, getCachedConfig(), setCachedConfig)
  }

  private async handleFetchCustomProviderModels(msg: Record<string, unknown>, ctx: ProviderContext): Promise<void> {
    const rid = typeof msg.requestId === "string" ? msg.requestId : ""
    const url = typeof msg.baseURL === "string" ? msg.baseURL : ""
    if (!rid || !url) return
    const key = typeof msg.apiKey === "string" ? msg.apiKey : undefined
    const headers = msg.headers && typeof msg.headers === "object" ? (msg.headers as Record<string, string>) : undefined
    try {
      const models = await fetchOpenAIModels({ baseURL: url, apiKey: key, headers })
      ctx.postMessage({ type: "customProviderModelsFetched", requestId: rid, models })
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Failed to fetch models"
      const auth = err instanceof FetchModelsError && err.auth
      ctx.postMessage({ type: "customProviderModelsFetched", requestId: rid, error: message, auth })
    }
  }

  private async handleTestAcpConnection(msg: Record<string, unknown>, ctx: ProviderContext): Promise<void> {
    const key = typeof msg.key === "string" ? msg.key : ""
    if (!key) return

    let isDone = false
    const done = (result: { success: boolean; models?: { id: string; name: string }[]; error?: string }) => {
      if (isDone) return
      isDone = true
      ctx.postMessage({ type: "acpTestResult", key, ...result })
    }

    try {
      const PREDEFINED = require("../../../../opencode/src/stratacode/acp-client/registry").PREDEFINED
      const predefined = PREDEFINED[key]
      
      const configObj = ctx.getCachedConfigMessage?.() as any
      const userConf = configObj?.acp_providers?.[key] || {}
      
      const cmdStr = userConf.command ?? predefined?.command
      if (!cmdStr) {
        return done({ success: false, error: "No command configured for this provider" })
      }

      const argsList = Array.isArray(cmdStr) ? cmdStr : cmdStr.split(" ")
      const cmd = argsList[0]
      const args = argsList.slice(1)

      const { spawn } = require("child_process")
      const child = spawn(cmd, args, {
        env: {
          ...process.env,
          ...(userConf.env || {}),
          STRATA_DISABLE_DEFAULT_PLUGINS: "1",
          STRATA_DISABLE_PROJECT_CONFIG: "1",
        },
        cwd: ctx.getWorkspaceDirectory() ?? process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      })

      const timeout = setTimeout(() => {
        child.kill()
        done({ success: false, error: "Connection timed out" })
      }, 15000)

      child.on("error", (err: Error) => {
        clearTimeout(timeout)
        done({ success: false, error: err.message })
      })

      const { ClientSideConnection, ndJsonStream } = require("@agentclientprotocol/sdk")
      const { Writable, Readable } = require("stream")

      const stream = ndJsonStream(
        Writable.toWeb(child.stdin),
        Readable.toWeb(child.stdout),
      )

      const conn = new ClientSideConnection((agent: any) => {
        return {} as any
      }, stream)

      conn.initialize({
        protocolVersion: 1,
        clientInfo: { name: "strata-test", version: "1.0.0" },
        clientCapabilities: {},
      }).then(() => {
        return conn.newSession({ cwd: ctx.getWorkspaceDirectory() ?? process.cwd(), mcpServers: [] })
      }).then((session: any) => {
        clearTimeout(timeout)
        const available = session.models?.availableModels ?? []
        const models = available.map((m: any) => ({
          id: m.modelId ?? m.id,
          name: m.name ?? m.modelId ?? m.id,
        }))
        done({ success: true, models })
        child.kill()
      }).catch((e: any) => {
        clearTimeout(timeout)
        done({ success: false, error: e.message })
        child.kill()
      })
    } catch (e: any) {
      done({ success: false, error: e.message })
    }
  }
}
