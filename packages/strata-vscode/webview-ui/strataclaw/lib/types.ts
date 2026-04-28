/**
 * StrataClaw webview types.
 *
 * Mirrors the extension host types for use in the SolidJS webview.
 * All data arrives via postMessage — no direct network access.
 *
 * SYNC: These types are mirrored from src/strataclaw/types.ts — keep both in sync.
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

export type ChatMessage = {
  id: string
  text: string
  user: string
  created: string
  bot: boolean
}

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

// Messages: Extension Host -> Webview
export type StrataClawOutMessage =
  | { type: "strataclaw.state"; state: StrataClawState }
  | { type: "strataclaw.message"; message: ChatMessage }
  | { type: "strataclaw.messageUpdated"; message: ChatMessage }
  | { type: "strataclaw.presence"; online: boolean }
  | { type: "strataclaw.status"; data: ClawStatus | null }
  | { type: "strataclaw.locale"; locale: string }
  | { type: "strataclaw.error"; error: string }
