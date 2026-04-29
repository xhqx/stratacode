/**
 * StrataClaw panel provider for the VS Code extension.
 *
 * Owns the Stream Chat WebSocket connection (in the extension host Node.js runtime)
 * and relays messages to/from the webview via postMessage.
 */

import * as vscode from "vscode"
import { homedir } from "os"
import type { StrataConnectionService } from "../services/cli-backend"
import type { StrataClient } from "@stratacode/sdk/v2/client"
import { buildWebviewHtml } from "../utils"
import { connect, history, presence, type ClawChatClient } from "./chat-client"
import type {
  StrataClawInMessage,
  StrataClawOutMessage,
  StrataClawState,
  ClawStatus,
  ChatCredentials,
  ChatMessage,
} from "./types"

const MAX_MESSAGES = 500
const STATUS_POLL_MS = 10_000

export class StrataClawProvider implements vscode.Disposable {
  static readonly viewType = "strata-code.new.StrataClawPanel"

  private panel: vscode.WebviewPanel | null = null
  private chat: ClawChatClient | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private subs: Array<() => void> = []
  private chatSubs: Array<() => void> = []
  private messages: ChatMessage[] = []
  private status: ClawStatus | null = null
  private online = false
  private connected = false
  private disposed = false
  private initializing = false
  private generation = 0

  constructor(
    private readonly uri: vscode.Uri,
    private readonly connection: StrataConnectionService,
  ) {}

  openPanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One)
      return
    }

    const panel = vscode.window.createWebviewPanel(StrataClawProvider.viewType, "StrataClaw", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.uri],
    })

    this.attach(panel)
  }

  /** Restore a serialized panel after VS Code restart. */
  restorePanel(panel: vscode.WebviewPanel): void {
    this.attach(panel)
  }

  dispose(): void {
    this.disposed = true
    this.cleanup()
    this.panel?.dispose()
    this.panel = null
  }

  // --- private ---

  private attach(panel: vscode.WebviewPanel): void {
    if (this.panel) {
      this.cleanup()
      this.panel.dispose()
    }
    this.panel = panel

    panel.iconPath = {
      light: vscode.Uri.joinPath(this.uri, "assets", "icons", "strata-icon.svg"),
      dark: vscode.Uri.joinPath(this.uri, "assets", "icons", "strata-comet-white.svg"),
    }

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.uri],
    }

    panel.webview.html = buildWebviewHtml(panel.webview, {
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.uri, "dist", "strataclaw.js")),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.uri, "dist", "strataclaw.css")),
      iconsBaseUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.uri, "assets", "icons")),
      title: "StrataClaw",
    })

    const msgSub = panel.webview.onDidReceiveMessage((msg: StrataClawInMessage) => this.onMessage(msg))
    this.subs.push(() => msgSub.dispose())
    const disposeSub = panel.onDidDispose(() => {
      this.panel = null
      this.cleanup()
    })
    this.subs.push(() => disposeSub.dispose())

    // Pause status polling when the panel is not visible to avoid unnecessary HTTP traffic
    const viewSub = panel.onDidChangeViewState(() => {
      if (panel.visible) this.startPolling()
      else this.stopPolling()
    })
    this.subs.push(() => viewSub.dispose())

    // Subscribe to language changes broadcast by other StrataProvider instances
    const unsub = this.connection.onLanguageChanged((locale) => {
      this.post({ type: "strataclaw.locale", locale })
    })
    this.subs.push(unsub)
  }

  private post(msg: StrataClawOutMessage): void {
    this.panel?.webview.postMessage(msg)
  }

  private async onMessage(msg: StrataClawInMessage): Promise<void> {
    switch (msg.type) {
      case "strataclaw.ready":
        await this.init()
        break
      case "strataclaw.send":
        await this.sendChat(msg.text)
        break
      case "strataclaw.openExternal": {
        const uri = vscode.Uri.parse(msg.url)
        if (uri.scheme === "https" || uri.scheme === "http") {
          void vscode.env.openExternal(uri)
        }
        break
      }
    }
  }

  private get locale(): string {
    const override = vscode.workspace.getConfiguration("strata-code.new").get<string>("language")
    return override || vscode.env.language
  }

  private stale(gen: number): boolean {
    return gen !== this.generation || this.disposed
  }

  private async init(): Promise<void> {
    if (this.initializing || this.disposed) return
    this.initializing = true
    const gen = this.generation

    // Track whether we deferred to waitForConnection — if so, keep
    // `initializing` true so duplicate strataclaw.ready messages are
    // harmlessly ignored until the connection arrives.
    let deferred = false

    try {
      this.post({ type: "strataclaw.state", state: { phase: "loading", locale: this.locale } })

      const client = await this.resolveClient()
      if (this.stale(gen)) return
      if (!client) {
        deferred = true
        this.waitForConnection()
        return
      }

      const credentials = await this.fetchCreds(client, gen)
      if (!credentials) return

      // Connect to Stream Chat
      try {
        await this.connectChat(credentials, gen)
      } catch (err: unknown) {
        if (this.stale(gen)) return
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[Strata New] StrataClaw chat connect failed:", msg)
        this.post({
          type: "strataclaw.state",
          state: {
            phase: "ready",
            locale: this.locale,
            status: this.status,
            connected: false,
            online: false,
            messages: [],
          },
        })
        this.post({ type: "strataclaw.error", error: msg || "Failed to connect to chat" })
        this.startPolling()
        return
      }

      if (this.stale(gen)) return

      // Push ready state
      const state: StrataClawState = {
        phase: "ready",
        locale: this.locale,
        status: this.status,
        connected: this.connected,
        online: this.online,
        messages: this.messages,
      }
      this.post({ type: "strataclaw.state", state })
      this.startPolling()
    } finally {
      if (!deferred) this.initializing = false
    }
  }

  /**
   * Fetch and validate instance status + chat credentials.
   * Returns credentials on success, null when stale or after posting an error/state.
   */
  private async fetchCreds(client: StrataClient, gen: number): Promise<ChatCredentials | null> {
    const res = await client.strata.claw.status().catch(() => null)
    if (this.stale(gen)) return null

    // Distinguish SDK/network errors from business states
    if (!res || (res as Record<string, unknown>).error) {
      this.post({
        type: "strataclaw.state",
        state: { phase: "error", locale: this.locale, error: "Failed to connect to Strata service" },
      })
      return null
    }

    if (!res.data || (res.data as Record<string, unknown>).error) {
      this.post({ type: "strataclaw.state", state: { phase: "noInstance", locale: this.locale } })
      return null
    }

    const data = res.data as ClawStatus & { userId?: string }
    if (!data.userId) {
      this.post({ type: "strataclaw.state", state: { phase: "noInstance", locale: this.locale } })
      return null
    }

    this.status = data

    const creds = await client.strata.claw.chatCredentials().catch(() => null)
    if (this.stale(gen)) return null

    // Distinguish SDK/network errors from business states
    if (!creds || (creds as Record<string, unknown>).error) {
      this.post({
        type: "strataclaw.state",
        state: { phase: "error", locale: this.locale, error: "Failed to fetch chat credentials" },
      })
      return null
    }

    if (!creds.data) {
      this.post({ type: "strataclaw.state", state: { phase: "needsUpgrade", locale: this.locale } })
      return null
    }

    return creds.data as ChatCredentials
  }

  /**
   * Ensure the CLI backend is running and return its SDK client.
   * Returns `null` when the backend isn't available yet (caller should defer).
   */
  private async resolveClient() {
    if (this.connection.getConnectionState() !== "connected") {
      try {
        const dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? homedir()
        await this.connection.connect(dir)
      } catch (err) {
        console.debug("[Strata New] StrataClaw connect deferred:", (err as Error)?.message ?? err)
        return null
      }
    }
    try {
      return this.connection.getClient()
    } catch (err) {
      console.debug("[Strata New] StrataClaw getClient deferred:", (err as Error)?.message ?? err)
      return null
    }
  }

  private async connectChat(creds: ChatCredentials, gen: number): Promise<void> {
    // Disconnect previous client to avoid duplicate websockets/listeners
    this.disconnectChat()

    const client = await connect(creds)

    // If the panel was disposed or reinitialized while connect() was in flight,
    // tear down the freshly-created client immediately to avoid leaked websockets.
    if (this.stale(gen)) {
      client.disconnect().catch((err) => {
        console.error("[Strata New] StrataClaw stale disconnect failed:", err?.message ?? err)
      })
      return
    }

    this.chat = client

    // Load history
    const bot = `bot-${creds.channelId.replace(/^default-/, "")}`
    this.messages = history(this.chat.channel, bot)
    this.online = presence(this.chat.channel, bot)
    this.connected = true

    // Subscribe to events and relay to webview
    const unsub = this.chat.onMessage((msg) => {
      // Dedupe: if a message with this id already exists, treat as update
      const idx = this.messages.findIndex((m) => m.id === msg.id)
      if (idx !== -1) {
        this.messages = this.messages.map((m, i) => (i === idx ? msg : m))
        this.post({ type: "strataclaw.messageUpdated", message: msg })
        return
      }
      this.messages = [...this.messages, msg]
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES)
      }
      this.post({ type: "strataclaw.message", message: msg })
    })
    this.chatSubs.push(unsub)

    const unsubUpdated = this.chat.onMessageUpdated((msg) => {
      const idx = this.messages.findIndex((m) => m.id === msg.id)
      if (idx === -1) {
        this.messages = [...this.messages, msg]
        if (this.messages.length > MAX_MESSAGES) {
          this.messages = this.messages.slice(-MAX_MESSAGES)
        }
      } else {
        this.messages = this.messages.map((m, i) => (i === idx ? msg : m))
      }
      this.post({ type: "strataclaw.messageUpdated", message: msg })
    })
    this.chatSubs.push(unsubUpdated)

    const unsubPresence = this.chat.onPresence((val) => {
      this.online = val
      this.post({ type: "strataclaw.presence", online: val })
    })
    this.chatSubs.push(unsubPresence)
  }

  private disconnectChat(): void {
    for (const unsub of this.chatSubs) unsub()
    this.chatSubs = []

    if (this.chat) {
      this.chat.disconnect().catch((err) => {
        console.error("[Strata New] StrataClaw disconnect failed:", err?.message ?? err)
      })
      this.chat = null
    }

    this.connected = false
    this.online = false
  }

  private async sendChat(text: string): Promise<void> {
    if (!this.chat) {
      this.post({ type: "strataclaw.error", error: "Chat not connected" })
      return
    }
    try {
      await this.chat.send(text)
    } catch (err) {
      console.error("[Strata New] StrataClaw send failed:", err instanceof Error ? err.message : err)
      this.post({ type: "strataclaw.error", error: "Failed to send message" })
    }
  }

  private startPolling(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), STATUS_POLL_MS)
  }

  private stopPolling(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private async poll(): Promise<void> {
    try {
      const client = this.connection.getClient()
      const res = await client.strata.claw.status()
      if (res?.data) {
        this.status = res.data as ClawStatus
        this.post({ type: "strataclaw.status", data: this.status })
      }
    } catch (err) {
      console.debug("[Strata New] StrataClaw poll failed:", (err as Error)?.message ?? err)
    }
  }

  /** Subscribe to connection state changes and re-run init() once connected. */
  private waitForConnection(): void {
    const unsub = this.connection.onStateChange((state) => {
      if (state === "connected" && !this.disposed) {
        unsub()
        this.initializing = false
        void this.init()
      }
    })
    this.subs.push(unsub)
  }

  private cleanup(): void {
    this.generation++

    for (const unsub of this.subs) unsub()
    this.subs = []

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.disconnectChat()

    this.messages = []
    this.initializing = false
    this.status = null
  }
}
