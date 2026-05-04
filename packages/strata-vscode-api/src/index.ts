import * as vscode from "vscode"

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

export type UIPlacement = "input-toolbar" | "toolbar-top" | "message-action"

export type UIContribution = {
  /** Must be unique per plugin (e.g., "strata-review.branchButton") */
  id: string
  /** Where this contribution should be rendered in the Strata UI */
  placement: UIPlacement
  /** Currently only buttons are supported */
  type: "button"
  /** Optional text label for the button */
  label?: string
  /** Optional Codicon name (e.g., "git-compare") */
  icon?: string
  /** The VS Code command to execute securely in the extension host when clicked */
  command: string
  /** Safe, serializable arguments to pass to the command */
  commandArgs?: JSONValue[]
  /** Optional tooltip shown on hover */
  tooltip?: string
}

export interface SessionInfo {
  id: string
  title: string
  providerID?: string
  modelID?: string
  agent?: string
  variant?: string
  worktreeId?: string
  directory: string
}

export interface SendOptions {
  /** The prompt text to send */
  text: string
  /** Array of absolute file paths to include as attachments */
  files?: string[]
  /** Target specific session, or create new */
  sessionId?: string
  /** Override agent mode */
  agent?: string
  /** Focus Strata sidebar into view (default: true) */
  focus?: boolean
}

export interface PluginConfigField {
  key: string
  type: "string" | "boolean" | "number" | "select"
  label: string
  description?: string
  default?: JSONValue
  /** Only for type "select" */
  options?: Array<{ label: string; value: string }>
}

export interface PluginConfigSection {
  id: string
  title: string
  icon?: string
  fields: PluginConfigField[]
}

export interface PluginFeatureMetadata {
  /** Unique ID (e.g. "my-plugin.codeReview"). Must not collide with built-in IDs. */
  id: string
  /** Human-readable label */
  label: string
  /** Short description for the settings UI */
  description: string
  /** Codicon icon name */
  icon?: string
  /** Default enabled state */
  default?: boolean
  /** Optional settings fields rendered in the feature's detail panel */
  settings?: PluginConfigField[]
}

export interface ContextItem {
  type: "text"
  content: string
  label: string
}

export interface ContextProvider {
  id: string
  label: string
  provideContext(session: SessionInfo): Promise<ContextItem[]>
}

export interface WillSendMessageEvent {
  sessionId: string
  text: string
  /** Call to prevent the message from being sent. First caller wins. */
  cancel(): void
}

export interface DidCompleteMessageEvent {
  sessionId: string
}

export interface StrataPluginAPI {
  /**
   * Send a message to the active Strata chat session.
   * Prioritizes the active agent-manager tab if focused, otherwise falls back to the sidebar chat.
   */
  sendMessage(options: SendOptions): Promise<void>

  /**
   * Gets the currently active session metadata, if any.
   * Returns undefined if no session is active or if Strata is not ready.
   */
  getActiveSession(): Promise<SessionInfo | undefined>

  /**
   * Focuses the Strata chat view.
   * Prioritizes focusing the active agent-manager tab if one is open, otherwise reveals the sidebar chat.
   */
  focus(): Promise<void>

  /**
   * Registers a UI element to be rendered inside the Strata webview.
   * Click events on the UI element will execute the specified VS Code command.
   * @param contribution The UI element configuration
   * @returns A disposable that removes the contribution when disposed
   */
  registerUIContribution(contribution: UIContribution): vscode.Disposable

  /** Fired when a new chat session is created (in any panel/worktree) */
  readonly onDidCreateSession: vscode.Event<SessionInfo>

  /** Fired when the globally focused/active session changes */
  readonly onDidChangeActiveSession: vscode.Event<SessionInfo | undefined>

  /** Fired before a message is sent to a session. Allows cancellation. */
  readonly onWillSendMessage: vscode.Event<WillSendMessageEvent>

  /** Fired when a session completes processing a message (transitions to idle). */
  readonly onDidCompleteMessage: vscode.Event<DidCompleteMessageEvent>

  /**
   * Registers a configuration section for the plugin that will be rendered
   * in the Strata Code Settings panel under "Extensions".
   */
  registerConfigSection(section: PluginConfigSection): vscode.Disposable

  /** Retrieves a configuration value for a registered plugin section. */
  getPluginConfigValue(sectionId: string, key: string): JSONValue | undefined

  /** Fired when a plugin configuration value changes (e.g. from the UI or settings.json). */
  readonly onDidChangePluginConfig: vscode.Event<{ sectionId: string; key: string; value: JSONValue }>

  /**
   * Registers a context provider that can inject additional data into prompts
   * before they are sent to the CLI.
   */
  registerContextProvider(provider: ContextProvider): vscode.Disposable

  /**
   * Register feature metadata that appears as a toggleable entry in
   * Settings → Features. The toggle state is stored in the plugin's
   * own VS Code settings namespace.
   *
   * Plugins are responsible for reading their own setting and activating
   * or deactivating their functionality accordingly.
   *
   * @returns A disposable that removes the feature listing when disposed.
   */
  registerFeatureMetadata(feature: PluginFeatureMetadata): vscode.Disposable

  /** Strata Code extension version */
  readonly version: string
}
