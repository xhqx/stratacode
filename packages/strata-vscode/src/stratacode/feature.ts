import type * as vscode from "vscode"
import type { StrataClient } from "@stratacode/sdk/v2/client"
import type { FeatureKey } from "./feature-defaults"

export type PostMessage = (msg: Record<string, unknown>) => void

export interface FeatureContext {
  /** SDK client (null if not connected) */
  client: StrataClient | null
  /** Post a message to the webview */
  post: PostMessage
  /** Workspace directory */
  directory: string
}

export interface Feature extends vscode.Disposable {
  readonly id: FeatureKey
  readonly configKeys: readonly string[]
  readonly messageTypes: readonly string[]

  /** Side-effect when feature toggle changes in handleUpdateSetting */
  onToggled(enabled: boolean, ctx: FeatureContext): Promise<void>
  /** React to onDidChangeConfiguration for keys in configKeys */
  onConfigChanged(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void
  /** Handle webview message. Return true if consumed. */
  handleMessage(msg: Record<string, unknown>, ctx: FeatureContext): boolean | Promise<boolean>
  /** Push current state to webview (called during syncWebviewState + handleResetAllSettings) */
  pushState(ctx: FeatureContext): void
}
