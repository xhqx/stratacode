/**
 * StrataClaw VS Code extension message types.
 *
 * Defines the postMessage protocol between the extension host (Node.js)
 * and the StrataClaw webview (SolidJS). The extension host owns all network
 * connections (SDK + Stream Chat) and relays data to the webview.
 *
 * SYNC: Shared types (ClawStatus, ChatMessage, StrataClawState, StrataClawOutMessage)
 * are mirrored in webview-ui/strataclaw/lib/types.ts — keep both in sync.
 */

export type ClawStatus = {
  status: "provisioned" | "starting" | "restarting" | "running" | "stopped" | "destroying" | null
  sandboxId?: string
  flyRegion?: string
  machineSize?: { cpus: number; memory_mb: number }
  openclawVersion?: string | null
  lastStartedAt?: string | null
  lastStoppedAt?: string | null
  channelCount?: number
  secretCount?: number
}

export type ChatCredentials = {
  apiKey: string
  userId: string
  userToken: string
  channelId: string
}

export type ChatMessage = {
  id: string
  text: string
  user: string
  created: string // ISO string (serializable via postMessage)
  bot: boolean
}

// Full state snapshot pushed to the webview
// Every phase carries `locale` so the webview can resolve translations immediately.
export type StrataClawState =
  | { phase: "loading"; locale: string }
  | { phase: "noInstance"; locale: string }
  | { phase: "needsUpgrade"; locale: string }
  | { phase: "error"; locale: string; error: string }
  | {
      phase: "ready"
      locale: string
      status: ClawStatus | null
      connected: boolean
      online: boolean
      messages: ChatMessage[]
    }

// Messages: Webview → Extension Host
export type StrataClawInMessage =
  | { type: "strataclaw.ready" }
  | { type: "strataclaw.send"; text: string }
  | { type: "strataclaw.openExternal"; url: string }

// Messages: Extension Host → Webview
export type StrataClawOutMessage =
  | { type: "strataclaw.state"; state: StrataClawState }
  | { type: "strataclaw.message"; message: ChatMessage }
  | { type: "strataclaw.messageUpdated"; message: ChatMessage }
  | { type: "strataclaw.presence"; online: boolean }
  | { type: "strataclaw.status"; data: ClawStatus | null }
  | { type: "strataclaw.locale"; locale: string }
  | { type: "strataclaw.error"; error: string }
