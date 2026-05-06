import type { InstallMarketplaceItemOptions, MarketplaceFilters, MarketplaceItem } from "../marketplace"
import type { FileAttachment } from "./parts"
import type { MessageLoadMode } from "./sessions"
import type { PermissionFileDiff } from "./permissions"
import type { ModelSelection, ProviderConfig } from "./providers"
import type { Config } from "./config"
import type { ModelAllocation } from "./agent-manager"
import type {
  ClearLegacyDataMessage,
  FinalizeLegacyMigrationMessage,
  RequestLegacyMigrationDataMessage,
  SkipLegacyMigrationMessage,
  StartLegacyMigrationMessage,
} from "./migration"
import type { KanbanTask } from "./kanban"

// ============================================
// Messages FROM webview TO extension
// ============================================

export interface SendMessageRequest {
  type: "sendMessage"
  text: string
  messageID?: string
  sessionID?: string
  draftID?: string
  providerID?: string
  modelID?: string
  agent?: string
  variant?: string
  files?: FileAttachment[]
}

export interface InputFocusedRequest {
  type: "inputFocused"
  draftID?: string
}

export interface AbortRequest {
  type: "abort"
  sessionID: string
}

export interface RevertSessionRequest {
  type: "revertSession"
  sessionID: string
  messageID: string
}

export interface UnrevertSessionRequest {
  type: "unrevertSession"
  sessionID: string
}

export interface PermissionResponseRequest {
  type: "permissionResponse"
  permissionId: string
  sessionID: string
  response: "once" | "always" | "reject"
  approvedAlways: string[]
  deniedAlways: string[]
  scope?: "global" | "agent"
  agent?: string
}

export interface CreateSessionRequest {
  type: "createSession"
}

export interface ClearSessionRequest {
  type: "clearSession"
}

export interface LoadMessagesRequest {
  type: "loadMessages"
  sessionID: string
  mode?: MessageLoadMode
  before?: string
  limit?: number
}

export interface LoadSessionsRequest {
  type: "loadSessions"
}

export interface RequestCloudSessionsMessage {
  type: "requestCloudSessions"
  cursor?: string
  limit?: number
  gitUrl?: string
}

export interface RequestGitRemoteUrlMessage {
  type: "requestGitRemoteUrl"
}

export interface RequestCloudSessionDataMessage {
  type: "requestCloudSessionData"
  sessionId: string
}

export interface ImportAndSendMessage {
  type: "importAndSend"
  cloudSessionId: string
  text: string
  messageID?: string
  providerID?: string
  modelID?: string
  agent?: string
  variant?: string
  files?: FileAttachment[]
  command?: string
  commandArgs?: string
}

export interface LoginRequest {
  type: "login"
}

export interface LogoutRequest {
  type: "logout"
}

export interface RefreshProfileRequest {
  type: "refreshProfile"
}

export interface OpenExternalRequest {
  type: "openExternal"
  url: string
}

export interface OpenFileRequest {
  type: "openFile"
  filePath: string
  line?: number
  column?: number
}

export interface CancelLoginRequest {
  type: "cancelLogin"
}

export interface SetOrganizationRequest {
  type: "setOrganization"
  organizationId: string | null
}

export interface WebviewReadyRequest {
  type: "webviewReady"
}

export interface RequestProvidersMessage {
  type: "requestProviders"
}

export interface CompactRequest {
  type: "compact"
  sessionID: string
  providerID?: string
  modelID?: string
}

export interface OpenSettingsPanelRequest {
  type: "openSettingsPanel"
  tab?: string
}

export interface OpenVSCodeSettingsRequest {
  type: "openVSCodeSettings"
  query: string
}

export interface OpenConfigFileRequest {
  type: "openConfigFile"
  scope: "local" | "global"
  labels: {
    scope: string
    statusLoaded: string
    statusLoadedLegacy: string
    statusNotLoaded: string
    statusCreate: string
    title: string
    placeholder: string
    noWorkspace: string
    openFailed: string
    sourceXdg: string
    sourceHomeStrata: string
    sourceHomeStratacode: string
    sourceHomeOpencode: string
    sourceEnvFile: string
    sourceEnvDir: string
    sourceEnvContent: string
    sourceProjectStrata: string
    sourceProjectRoot: string
    sourceProjectStratacode: string
    sourceProjectOpencode: string
  }
}

export interface OpenMarketplacePanelRequest {
  type: "openMarketplacePanel"
}

export interface OpenAgentManagerRequest {
  type: "openAgentManager"
}

export interface OpenAdvancedWorktreeRequest {
  type: "openAdvancedWorktree"
}

export interface RequestAgentsMessage {
  type: "requestAgents"
}

export interface RequestSkillsMessage {
  type: "requestSkills"
}

export interface RequestCommandsMessage {
  type: "requestCommands"
}

export interface SendCommandRequest {
  type: "sendCommand"
  command: string
  arguments: string
  messageID?: string
  sessionID?: string
  draftID?: string
  providerID?: string
  modelID?: string
  agent?: string
  variant?: string
  files?: FileAttachment[]
}

export interface RemoveSkillMessage {
  type: "removeSkill"
  location: string
}

export interface RemoveModeMessage {
  type: "removeMode"
  name: string
}

export interface RemoveMcpMessage {
  type: "removeMcp"
  name: string
}

export interface RequestMcpStatusMessage {
  type: "requestMcpStatus"
}

export interface ConnectMcpMessage {
  type: "connectMcp"
  name: string
}

export interface DisconnectMcpMessage {
  type: "disconnectMcp"
  name: string
}

export interface SetLanguageRequest {
  type: "setLanguage"
  locale: string
}

export interface QuestionReplyRequest {
  type: "questionReply"
  requestID: string
  sessionID?: string
  answers: string[][]
}

export interface QuestionRejectRequest {
  type: "questionReject"
  requestID: string
  sessionID?: string
}

export interface SuggestionAcceptRequest {
  type: "suggestionAccept"
  requestID: string
  sessionID: string
  index: number
}

export interface SuggestionDismissRequest {
  type: "suggestionDismiss"
  requestID: string
  sessionID: string
}

export interface DeleteSessionRequest {
  type: "deleteSession"
  sessionID: string
}

export interface RenameSessionRequest {
  type: "renameSession"
  sessionID: string
  title: string
}

export interface RequestAutocompleteSettingsMessage {
  type: "requestAutocompleteSettings"
}

export interface UpdateAutocompleteSettingMessage {
  type: "updateAutocompleteSetting"
  key:
    | "enableAutoTrigger"
    | "enableSmartInlineTaskKeybinding"
    | "enableChatAutocomplete"
    | "model"
    | "chatMode"
    | "chatDebounceMs"
  value: boolean | string | number
}

export interface RequestChatCompletionMessage {
  type: "requestChatCompletion"
  text: string
  requestId: string
}

export interface RequestFileSearchMessage {
  type: "requestFileSearch"
  query: string
  requestId: string
  sessionID?: string
}

export interface RequestTerminalContextMessage {
  type: "requestTerminalContext"
  requestId: string
  sessionID?: string
}

export interface RequestGitChangesContextMessage {
  type: "requestGitChangesContext"
  requestId: string
  sessionID?: string
  agentManagerContext?: string
}

export interface ChatCompletionAcceptedMessage {
  type: "chatCompletionAccepted"
  suggestionLength?: number
}
export interface UpdateSettingRequest {
  type: "updateSetting"
  key: string
  value: unknown
}

export interface RequestSettingMessage {
  type: "requestSetting"
  key: string
}

export interface RequestTimelineSettingMessage {
  type: "requestTimelineSetting"
}

export interface RequestBrowserSettingsMessage {
  type: "requestBrowserSettings"
}

export interface RequestClaudeCompatSettingMessage {
  type: "requestClaudeCompatSetting"
}

export interface RequestConfigMessage {
  type: "requestConfig"
}

export interface RequestExtensionFeaturesMessage {
  type: "requestExtensionFeatures"
}

export interface RequestGlobalConfigMessage {
  type: "requestGlobalConfig"
}

export interface RequestIndexingStatusMessage {
  type: "requestIndexingStatus"
}

export interface OpenSettingsTabRequest {
  type: "openSettingsTab"
  tab: string
}

export interface UpdateConfigMessage {
  type: "updateConfig"
  config: Partial<Config>
}

export interface RequestPluginConfigMessage {
  type: "requestPluginConfig"
}

export interface SavePluginConfigMessage {
  type: "savePluginConfig"
  sectionId: string
  changes: Record<string, import("@stratacode/vscode-api").JSONValue>
}

export interface TogglePluginFeatureMessage {
  type: "togglePluginFeature"
  featureId: string
  enabled: boolean
}

export interface RequestNotificationSettingsMessage {
  type: "requestNotificationSettings"
}

export interface ResetAllSettingsRequest {
  type: "resetAllSettings"
}

export interface SettingsTabChangedMessage {
  type: "settingsTabChanged"
  tab: string
}

export interface RequestNotificationsMessage {
  type: "requestNotifications"
}

export interface DismissNotificationMessage {
  type: "dismissNotification"
  notificationId: string
}

export interface SyncSessionRequest {
  type: "syncSession"
  sessionID: string
  parentSessionID?: string
}

// Agent Manager worktree messages
export interface CreateWorktreeSessionRequest {
  type: "agentManager.createWorktreeSession"
  text: string
  providerID?: string
  modelID?: string
  agent?: string
  files?: FileAttachment[]
}

export interface TelemetryRequest {
  type: "telemetry"
  event: string
  properties?: Record<string, unknown>
}

// Create a new worktree (with auto-created first session)
export interface CreateWorktreeRequest {
  type: "agentManager.createWorktree"
  baseBranch?: string
  branchName?: string
  variant?: string
}

// Delete a worktree and dissociate its sessions
export interface DeleteWorktreeRequest {
  type: "agentManager.deleteWorktree"
  worktreeId: string
}

// Remove a stale worktree entry from state without touching disk
export interface RemoveStaleWorktreeRequest {
  type: "agentManager.removeStaleWorktree"
  worktreeId: string
}

// Promote a session: create a worktree and move the session into it
export interface PromoteSessionRequest {
  type: "agentManager.promoteSession"
  sessionId: string
}

// Open an unassigned session locally (clear any worktree directory override)
export interface OpenLocallyRequest {
  type: "agentManager.openLocally"
  sessionId: string
}

// Add a new session to an existing worktree
export interface AddSessionToWorktreeRequest {
  type: "agentManager.addSessionToWorktree"
  worktreeId: string
}

// Fork an existing session (copies conversation history)
export interface ForkSessionRequest {
  type: "agentManager.forkSession"
  sessionId: string
  worktreeId?: string
  messageId?: string
}

export interface SidebarForkSessionRequest {
  type: "forkSession"
  sessionId: string
  messageId?: string
}

// Close (remove) a session from its worktree
export interface CloseSessionRequest {
  type: "agentManager.closeSession"
  sessionId: string
}

/** Persist a non-worktree session to agent-manager.json (worktreeId = null). */
export interface PersistSessionRequest {
  type: "agentManager.persistSession"
  sessionId: string
}

/** Remove a non-worktree session from agent-manager.json. */
export interface ForgetSessionRequest {
  type: "agentManager.forgetSession"
  sessionId: string
}

// Rename a worktree's display label
export interface RenameWorktreeRequest {
  type: "agentManager.renameWorktree"
  worktreeId: string
  label: string
}

export interface RequestRepoInfoMessage {
  type: "agentManager.requestRepoInfo"
}

export interface RequestStateMessage {
  type: "agentManager.requestState"
}

// Configure worktree setup script
export interface ConfigureSetupScriptRequest {
  type: "agentManager.configureSetupScript"
}

export interface ConfigureRunScriptRequest {
  type: "agentManager.configureRunScript"
}

export interface RunScriptRequest {
  type: "agentManager.runScript"
  worktreeId: string
}

export interface StopRunScriptRequest {
  type: "agentManager.stopRunScript"
  worktreeId: string
}

// Show terminal for a session
export interface ShowTerminalRequest {
  type: "agentManager.showTerminal"
  sessionId: string
}

// Show terminal for the local workspace (when no session is active)
export interface ShowLocalTerminalRequest {
  type: "agentManager.showLocalTerminal"
}

// Open a worktree directory in VS Code
export interface OpenWorktreeRequest {
  type: "agentManager.openWorktree"
  worktreeId: string
}

// Copy text to the system clipboard via the extension host
export interface CopyToClipboardRequest {
  type: "agentManager.copyToClipboard"
  text: string
}

// Show existing local terminal when switching to local context (no-op if none exists)
export interface ShowExistingLocalTerminalRequest {
  type: "agentManager.showExistingLocalTerminal"
}

// Create a new xterm terminal tab in the given worktree context (null = local)
export interface AgentManagerTerminalCreateRequest {
  type: "agentManager.terminal.create"
  worktreeId: string | null
}

// Close a terminal tab
export interface AgentManagerTerminalCloseRequest {
  type: "agentManager.terminal.close"
  terminalId: string
}

// Notify the extension of an xterm resize so it can update the backend PTY dimensions
export interface AgentManagerTerminalResizeRequest {
  type: "agentManager.terminal.resize"
  terminalId: string
  cols: number
  rows: number
}

// Open a file in the selected worktree for a specific session
export interface AgentManagerOpenFileRequest {
  type: "agentManager.openFile"
  sessionId: string
  filePath: string
  line?: number
  column?: number
}

// Create multiple worktree sessions for the same prompt (multi-version mode)
export interface CreateMultiVersionRequest {
  type: "agentManager.createMultiVersion"
  text?: string
  name?: string
  versions: number
  providerID?: string
  modelID?: string
  agent?: string
  files?: FileAttachment[]
  baseBranch?: string
  branchName?: string
  // Per-version model allocations for multi-model comparison mode.
  // When set, each entry expands to `count` versions with that model.
  // Overrides `versions`, `providerID`, and `modelID`.
  variant?: string
  modelAllocations?: ModelAllocation[]
}

// Persist tab order for a context (worktree ID or "local")
export interface SetTabOrderRequest {
  type: "agentManager.setTabOrder"
  key: string
  order: string[]
}

// Persist sidebar worktree order
export interface SetWorktreeOrderRequest {
  type: "agentManager.setWorktreeOrder"
  order: string[]
}

// Persist sessions collapsed state
export interface SetSessionsCollapsedRequest {
  type: "agentManager.setSessionsCollapsed"
  collapsed: boolean
}

// Persist review diff style preference
export interface SetReviewDiffStyleRequest {
  type: "agentManager.setReviewDiffStyle"
  style: "unified" | "split"
}

export interface RequestBranchesMessage {
  type: "agentManager.requestBranches"
}

export interface RequestExternalWorktreesMessage {
  type: "agentManager.requestExternalWorktrees"
}

export interface ImportFromBranchRequest {
  type: "agentManager.importFromBranch"
  branch: string
}

export interface ImportFromPRRequest {
  type: "agentManager.importFromPR"
  url: string
}

export interface ImportExternalWorktreeRequest {
  type: "agentManager.importExternalWorktree"
  path: string
  branch: string
}

export interface ImportAllExternalWorktreesRequest {
  type: "agentManager.importAllExternalWorktrees"
}

// Agent Manager: Request one-shot diff fetch (webview → extension)
export interface RequestWorktreeDiffMessage {
  type: "agentManager.requestWorktreeDiff"
  sessionId: string
}

export interface RequestWorktreeDiffFileMessage {
  type: "agentManager.requestWorktreeDiffFile"
  sessionId: string
  file: string
}

// Agent Manager: Start polling for live diff updates (webview → extension)
export interface StartDiffWatchMessage {
  type: "agentManager.startDiffWatch"
  sessionId: string
}

// Agent Manager: Stop polling for diff updates (webview → extension)
export interface StopDiffWatchMessage {
  type: "agentManager.stopDiffWatch"
}

// Agent Manager: PR messages (webview → extension)
export interface RefreshPRMessage {
  type: "agentManager.refreshPR"
  worktreeId: string
}

export interface OpenPRMessage {
  type: "agentManager.openPR"
  worktreeId: string
}

export interface ApplyWorktreeDiffMessage {
  type: "agentManager.applyWorktreeDiff"
  worktreeId: string
  selectedFiles?: string[]
}

// Agent Manager: Revert a single file in a worktree (webview → extension)
export interface RevertWorktreeFileMessage {
  type: "agentManager.revertWorktreeFile"
  sessionId: string
  file: string
}

// Variant persistence (webview → extension)
export interface PersistVariantRequest {
  type: "persistVariant"
  key: string
  value: string
}

// Request stored variants from extension (webview → extension)
export interface RequestVariantsMessage {
  type: "requestVariants"
}

// Enhance prompt request (webview → extension)
export interface EnhancePromptRequest {
  type: "enhancePrompt"
  text: string
  requestId: string
}

// Open the standalone changes viewer tab from the sidebar
export interface OpenChangesRequest {
  type: "openChanges"
  sessionId?: string
}

export interface DiffViewerRequestDiffMessage {
  type: "diffViewer.requestDiff"
  file: string
}

export interface DiffViewerExplainAllMessage {
  type: "diffViewer.explainAll"
  worktreeId?: string
}

export interface DiffViewerReplyToThreadMessage {
  type: "diffViewer.replyToThread"
  threadId: string
  text: string
}

export interface DiffViewerStartThreadMessage {
  type: "diffViewer.startThread"
  threadId: string
  file: string
  line: number
  endLine?: number
  text: string
  side?: "left" | "right"
}

export interface DiffViewerSendCommentsMessage {
  type: "diffViewer.sendComments"
  comments: any[]
  autoSend: boolean
}

export interface DiffViewerSetDiffStyleMessage {
  type: "diffViewer.setDiffStyle"
  style: "unified" | "split"
}

export interface DiffViewerRevertFileMessage {
  type: "diffViewer.revertFile"
  file: string
}

export interface DiffViewerCloseMessage {
  type: "diffViewer.close"
}

// Open diff virtual (permission diff) in the lightweight diff virtual panel
export interface OpenDiffVirtualRequest {
  type: "openDiffVirtual"
  diff: PermissionFileDiff
  initialDiffStyle: "unified" | "split"
}

export interface RetryConnectionRequest {
  type: "retryConnection"
}

// Open a sub-agent session in a read-only editor panel
export interface OpenSubAgentViewerRequest {
  type: "openSubAgentViewer"
  sessionID: string
  title?: string
}

// Preview an image attachment in VS Code's built-in image viewer
export interface PreviewImageRequest {
  type: "previewImage"
  dataUrl: string
  filename: string
}

// Set default base branch (webview → extension)
export interface SetDefaultBaseBranchRequest {
  type: "agentManager.setDefaultBaseBranch"
  branch?: string
}

// Report all open session IDs to extension for heartbeat (webview → extension)
export interface AgentManagerOpenSessionsMessage {
  type: "agentManager.openSessions"
  sessionIDs: string[]
}

export interface ToggleRemoteMessage {
  type: "toggleRemote"
}

export interface SetRemoteEnabledMessage {
  type: "setRemoteEnabled"
  enabled: boolean
}

export interface RequestRemoteStatusMessage {
  type: "requestRemoteStatus"
}

export interface ConnectProviderMessage {
  type: "connectProvider"
  requestId: string
  providerID: string
  apiKey: string
}

export interface AuthorizeProviderOAuthMessage {
  type: "authorizeProviderOAuth"
  requestId: string
  providerID: string
  method: number
}

export interface CompleteProviderOAuthMessage {
  type: "completeProviderOAuth"
  requestId: string
  providerID: string
  method: number
  code?: string
}

export interface DisconnectProviderMessage {
  type: "disconnectProvider"
  requestId: string
  providerID: string
}

export interface SaveCustomProviderMessage {
  type: "saveCustomProvider"
  requestId: string
  providerID: string
  config: ProviderConfig
  apiKey?: string
  apiKeyChanged?: boolean
}

export interface FetchCustomProviderModelsMessage {
  type: "fetchCustomProviderModels"
  requestId: string
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
}

export interface PersistRecentsRequest {
  type: "persistRecents"
  recents: ModelSelection[]
}

export interface RequestRecentsMessage {
  type: "requestRecents"
}

export interface ToggleFavoriteRequest {
  type: "toggleFavorite"
  action: "add" | "remove"
  providerID: string
  modelID: string
}

export interface RequestFavoritesMessage {
  type: "requestFavorites"
}

// Per-mode model selection persistence (webview → extension)
export interface PersistModelSelectionRequest {
  type: "persistModelSelection"
  agent: string
  providerID: string
  modelID: string
}

export interface ClearModelSelectionRequest {
  type: "clearModelSelection"
  agent: string
}

export interface RequestModelSelectionsMessage {
  type: "requestModelSelections"
}

// Continue in Worktree: transfer sidebar session + git state to an isolated worktree
export interface ContinueInWorktreeRequest {
  type: "continueInWorktree"
  sessionId: string
}

// Section CRUD messages (webview → extension)
export interface CreateSectionRequest {
  type: "agentManager.createSection"
  name: string
  color?: string
  worktreeIds?: string[]
}

export interface RenameSectionRequest {
  type: "agentManager.renameSection"
  sectionId: string
  name: string
}

export interface DeleteSectionRequest {
  type: "agentManager.deleteSection"
  sectionId: string
}

export interface SetSectionColorRequest {
  type: "agentManager.setSectionColor"
  sectionId: string
  color: string | null
}

export interface ToggleSectionCollapsedRequest {
  type: "agentManager.toggleSectionCollapsed"
  sectionId: string
}

export interface MoveToSectionRequest {
  type: "agentManager.moveToSection"
  worktreeIds: string[]
  sectionId: string | null
}

export interface MoveSectionRequest {
  type: "agentManager.moveSection"
  sectionId: string
  dir: -1 | 1
}

export interface FetchMarketplaceDataMessage {
  type: "fetchMarketplaceData"
}

export interface FilterMarketplaceItemsMessage {
  type: "filterMarketplaceItems"
  filters: MarketplaceFilters
}

export interface InstallMarketplaceItemMessage {
  type: "installMarketplaceItem"
  mpItem: MarketplaceItem
  mpInstallOptions: InstallMarketplaceItemOptions
}

export interface RemoveInstalledMarketplaceItemMessage {
  type: "removeInstalledMarketplaceItem"
  mpItem: MarketplaceItem
  mpInstallOptions: InstallMarketplaceItemOptions
}

export interface WebviewLogMessage {
  type: "webviewLog"
  level: "debug" | "info" | "warn" | "error"
  component: string
  message: string
  data?: any[]
}

export type WebviewMessage =
  | WebviewLogMessage
  | SendMessageRequest
  | InputFocusedRequest
  | AbortRequest
  | RevertSessionRequest
  | UnrevertSessionRequest
  | PermissionResponseRequest
  | CreateSessionRequest
  | ClearSessionRequest
  | LoadMessagesRequest
  | LoadSessionsRequest
  | RequestCloudSessionsMessage
  | RequestGitRemoteUrlMessage
  | LoginRequest
  | LogoutRequest
  | RefreshProfileRequest
  | OpenExternalRequest
  | OpenSettingsPanelRequest
  | OpenVSCodeSettingsRequest
  | OpenConfigFileRequest
  | OpenMarketplacePanelRequest
  | OpenAgentManagerRequest
  | OpenAdvancedWorktreeRequest
  | OpenFileRequest
  | CancelLoginRequest
  | SetOrganizationRequest
  | WebviewReadyRequest
  | RequestProvidersMessage
  | CompactRequest
  | RequestAgentsMessage
  | RequestSkillsMessage
  | RequestCommandsMessage
  | SendCommandRequest
  | RemoveSkillMessage
  | RemoveModeMessage
  | RemoveMcpMessage
  | RequestMcpStatusMessage
  | ConnectMcpMessage
  | DisconnectMcpMessage
  | SetLanguageRequest
  | QuestionReplyRequest
  | QuestionRejectRequest
  | SuggestionAcceptRequest
  | SuggestionDismissRequest
  | DeleteSessionRequest
  | RenameSessionRequest
  | RequestAutocompleteSettingsMessage
  | UpdateAutocompleteSettingMessage
  | RequestChatCompletionMessage
  | RequestFileSearchMessage
  | RequestTerminalContextMessage
  | RequestGitChangesContextMessage
  | ChatCompletionAcceptedMessage
  | UpdateSettingRequest
  | RequestTimelineSettingMessage
  | RequestSettingMessage
  | RequestBrowserSettingsMessage
  | RequestClaudeCompatSettingMessage
  | RequestConfigMessage
  | RequestExtensionFeaturesMessage
  | RequestGlobalConfigMessage
  | RequestIndexingStatusMessage
  | UpdateConfigMessage
  | OpenSettingsTabRequest
  | RequestNotificationSettingsMessage
  | ResetAllSettingsRequest
  | SettingsTabChangedMessage
  | SyncSessionRequest
  | CreateWorktreeSessionRequest
  | RequestNotificationsMessage
  | DismissNotificationMessage
  | CreateWorktreeRequest
  | DeleteWorktreeRequest
  | RemoveStaleWorktreeRequest
  | PromoteSessionRequest
  | OpenLocallyRequest
  | AddSessionToWorktreeRequest
  | ForkSessionRequest
  | SidebarForkSessionRequest
  | CloseSessionRequest
  | PersistSessionRequest
  | ForgetSessionRequest
  | RenameWorktreeRequest
  | TelemetryRequest
  | RequestRepoInfoMessage
  | RequestStateMessage
  | ConfigureSetupScriptRequest
  | ConfigureRunScriptRequest
  | RunScriptRequest
  | StopRunScriptRequest
  | ShowTerminalRequest
  | ShowLocalTerminalRequest
  | OpenWorktreeRequest
  | CopyToClipboardRequest
  | ShowExistingLocalTerminalRequest
  | AgentManagerOpenFileRequest
  | CreateMultiVersionRequest
  | SetTabOrderRequest
  | SetWorktreeOrderRequest
  | SetSessionsCollapsedRequest
  | SetReviewDiffStyleRequest
  | PersistVariantRequest
  | RequestVariantsMessage
  | RequestCloudSessionDataMessage
  | ImportAndSendMessage
  | RequestBranchesMessage
  | RequestExternalWorktreesMessage
  | ImportFromBranchRequest
  | ImportFromPRRequest
  | ImportExternalWorktreeRequest
  | ImportAllExternalWorktreesRequest
  | RequestWorktreeDiffMessage
  | RequestWorktreeDiffFileMessage
  | StartDiffWatchMessage
  | StopDiffWatchMessage
  | RefreshPRMessage
  | OpenPRMessage
  // legacy-migration start
  | RequestLegacyMigrationDataMessage
  | StartLegacyMigrationMessage
  | SkipLegacyMigrationMessage
  | ClearLegacyDataMessage
  | FinalizeLegacyMigrationMessage
  // legacy-migration end
  | ApplyWorktreeDiffMessage
  | RevertWorktreeFileMessage
  | EnhancePromptRequest
  | OpenChangesRequest
  | DiffViewerRequestDiffMessage
  | DiffViewerExplainAllMessage
  | DiffViewerReplyToThreadMessage
  | DiffViewerStartThreadMessage
  | DiffViewerSendCommentsMessage
  | DiffViewerSetDiffStyleMessage
  | DiffViewerRevertFileMessage
  | DiffViewerCloseMessage
  | OpenDiffVirtualRequest
  | RetryConnectionRequest
  | OpenSubAgentViewerRequest
  | PreviewImageRequest
  | SetDefaultBaseBranchRequest
  | AgentManagerOpenSessionsMessage
  | FetchMarketplaceDataMessage
  | FilterMarketplaceItemsMessage
  | InstallMarketplaceItemMessage
  | RemoveInstalledMarketplaceItemMessage
  | ConnectProviderMessage
  | AuthorizeProviderOAuthMessage
  | CompleteProviderOAuthMessage
  | DisconnectProviderMessage
  | SaveCustomProviderMessage
  | FetchCustomProviderModelsMessage
  | PersistRecentsRequest
  | RequestRecentsMessage
  | ToggleFavoriteRequest
  | RequestFavoritesMessage
  | PersistModelSelectionRequest
  | ClearModelSelectionRequest
  | RequestModelSelectionsMessage
  | ToggleRemoteMessage
  | SetRemoteEnabledMessage
  | RequestRemoteStatusMessage
  | ContinueInWorktreeRequest
  | CreateSectionRequest
  | RenameSectionRequest
  | DeleteSectionRequest
  | SetSectionColorRequest
  | ToggleSectionCollapsedRequest
  | MoveToSectionRequest
  | MoveSectionRequest
  | AgentManagerTerminalCreateRequest
  | AgentManagerTerminalCloseRequest
  | AgentManagerTerminalResizeRequest
  | ExecutePluginContributionMessage
  | RequestPluginConfigMessage
  | SavePluginConfigMessage
  | TogglePluginFeatureMessage
  | SaveKanbanTasksRequest
  | RequestKanbanTasksMessage
  | PlanningAddMessage
  | PlanningUpdateMessage
  | PlanningRemoveMessage
  | PlanningDispatchMessage
  | PlanningConfirmMessage
  | PlanningRequestStateMessage
  | PlanningApplyMarkdownMessage
  | PlanningRequestMarkdownPreviewMessage
  | PlanningOpenPlanFileMessage
  // stratacode_change start
  | DocsRequestManifestMessage
  | DocsRequestPageMessage
  | DocsGenerateMessage
  | DocsRegenerateMessage
  | DocsOpenInEditorMessage
  // stratacode_change end
  | { type: "cancelAutoApproveTimer"; requestId: string }
  | RequestRepoMapStatsMessage
  | InvalidateRepoMapMessage
  | RequestTaskSuggestionsMessage
  | RequestAgentChatCompletionMessage
  | TestAcpConnectionMessage

export interface TestAcpConnectionMessage {
  type: "testAcpConnection"
  key: string
}

export interface RequestRepoMapStatsMessage {
  type: "requestRepoMapStats"
}

export interface InvalidateRepoMapMessage {
  type: "invalidateRepoMap"
}

// stratacode_change start
export interface RequestTaskSuggestionsMessage {
  type: "requestTaskSuggestions"
  requestId: string
}

export interface RequestAgentChatCompletionMessage {
  type: "requestAgentChatCompletion"
  text: string
  requestId: string
}
// stratacode_change end

// stratacode_change start
export interface DocsRequestManifestMessage {
  type: "docs.requestManifest"
}

export interface DocsRequestPageMessage {
  type: "docs.requestPage"
  id: string
}

export interface DocsGenerateMessage {
  type: "docs.generate"
}

export interface DocsRegenerateMessage {
  type: "docs.regenerate"
  id: string
}

export interface DocsOpenInEditorMessage {
  type: "docs.openInEditor"
  id: string
}
// stratacode_change end

export interface SaveKanbanTasksRequest {
  type: "saveKanbanTasks"
  tasks: KanbanTask[]
}

export interface RequestKanbanTasksMessage {
  type: "requestKanbanTasks"
}

export interface PlanningAddMessage {
  type: "planning.add"
  title: string
  description?: string
  prompt: string
  agent?: string
  providerID?: string
  modelID?: string
  startAt?: string
  deadline?: string
  duration?: number
  priority?: number
  dependsOn?: string[]
}

export interface PlanningUpdateMessage {
  type: "planning.update"
  taskId: string
  updates: Partial<
    Omit<
      import("./planning").PlanningTask,
      "id" | "created" | "sessionID" | "worktreeID" | "dispatchedAt" | "completedAt" | "error"
    >
  >
}

export interface PlanningRemoveMessage {
  type: "planning.remove"
  taskId: string
}

export interface PlanningDispatchMessage {
  type: "planning.dispatch"
  taskId: string
}

export interface PlanningConfirmMessage {
  type: "planning.confirm"
  taskId: string
}

export interface PlanningRequestStateMessage {
  type: "planning.requestState"
}
export interface ExecutePluginContributionMessage {
  type: "executePluginContribution"
  id: string
}

export interface PlanningApplyMarkdownMessage {
  type: "planning.applyMarkdown"
}

export interface PlanningRequestMarkdownPreviewMessage {
  type: "planning.requestMarkdownPreview"
}

export interface PlanningOpenPlanFileMessage {
  type: "planning.openPlanFile"
  file: string
  line?: number
}

// ============================================
// VS Code API type
// ============================================

export interface VSCodeAPI {
  postMessage(message: WebviewMessage): void
  getState(): unknown
  setState(state: unknown): void
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI
}
