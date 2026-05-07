/* eslint-disable max-lines */
import * as path from "path"
import * as vscode from "vscode"
import { buildPreviewPath, getPreviewCommand, getPreviewDir, parseImage, trimEntries } from "./image-preview"
import { isAbsolutePath } from "./path-utils"
import type {
  StrataClient,
  Session,
  SessionStatus,
  Event,
  TextPartInput,
  FilePartInput,
  Config,
} from "@stratacode/sdk/v2/client"
import { type StrataConnectionService, ServerStartupError } from "./services/cli-backend"
import { pluginRegistry } from "./plugin-api"
import {
  buildPluginConfigLoaded,
  handleSavePluginConfig,
  applyPluginHooks,
  markPending,
  checkCompletion,
} from "./stratacode/plugin-config-handlers"
import type { EditorContext, IndexingStatus } from "./services/cli-backend/types"
import { FileIgnoreController } from "./services/autocomplete/shims/FileIgnoreController"
import { ChatTextAreaAutocomplete } from "./services/autocomplete/chat-autocomplete/ChatTextAreaAutocomplete"
import { buildWebviewHtml } from "./utils"
import { TelemetryProxy, type TelemetryPropertiesProvider } from "./services/telemetry"
import {
  sessionToWebview,
  indexProvidersById,
  filterVisibleAgents,
  buildSettingPath,
  mapSSEEventToWebviewMessage,
  getErrorMessage,
  getConfigErrorDetails,
  isEventFromForeignProject,
  MessageConfirmation,
  runWithMessageConfirmation,
  loadSessions as loadSessionsUtil,
  flushPendingSessionRefresh as flushPendingSessionRefreshUtil,
  resolveContextDirectory,
  resolveWorkspaceDirectory,
  SessionStreamScheduler,
  type SessionRefreshContext,
} from "./strata-provider-utils"
import { GitOps } from "./agent-manager/GitOps"
import { GitStatsPoller, type LocalStats } from "./agent-manager/GitStatsPoller"
import { buildIndexedPatches, parseExplainResponse, shouldPreSkip, buildExplainPrompt } from "./explain-skip"
import type { ReviewThread } from "./DiffViewerProvider"
import { diffSummary as localDiffSummary, batchPatches, ancestor as localAncestor } from "./agent-manager/local-diff"
import { getWorkspaceRoot } from "./review-utils"
import { MarketplaceService, type MarketplaceItem, type RemoveResult } from "./services/marketplace"
import type { RemoteStatusService } from "./services/RemoteStatusService"
import { resolveProjectDirectory } from "./project-directory"
import { getBusySessionCount, seedSessionStatuses } from "./session-status"
import { retry } from "./services/cli-backend/retry"
import { slimPart, slimParts } from "./strata-provider/slim-metadata"
import { handleSidebarWorktreeMessage } from "./strata-provider/sidebar-worktree"
import { parseMessageFiles, type MessageFile } from "./strata-provider/message-files"
import { readAll as readAllFeatures } from "./stratacode/feature-gate"
import { handleFileSearch } from "./strata-provider/file-search"
import { getTerminalContents } from "./services/terminal/context"
import { disposeGitChangesTarget } from "./strata-provider/git-changes-target"
import { interceptMessage } from "./strata-provider/git-changes-request"
import { matchFollowup, recordFollowup, type Followup } from "./strata-provider/followup-session"
import { clearCommandsCache, loadCommands } from "./strata-provider/commands"
import { fetchMessagePage, MESSAGE_PAGE_LIMIT } from "./strata-provider/message-page"
import { childID } from "./strata-provider/task-session"
import { handleNetworkEvent, clearNetworkWaits } from "./strata-provider/network"
import { abortSession } from "./strata-provider/abort"
import { AutocompleteSettingsManager } from "./services/autocomplete/AutocompleteSettingsManager"
import * as ModelState from "./strata-provider/model-state"
import { handleForkSession } from "./strata-provider/fork-session"
import { openConfig } from "./strata-provider/open-config"
import { retryable, backoff, MAX_RETRIES } from "./util/retry"
import { hasGit } from "./strata-provider/git-status"
// legacy-migration start
import {
  checkAndShowMigrationWizard,
  handleRequestLegacyMigrationData,
  handleStartLegacyMigration,
  handleFinalizeLegacyMigration,
  handleSkipLegacyMigration,
  handleClearLegacyData,
  type MigrationContext,
} from "./strata-provider/handlers/migration"
// legacy-migration end
import {
  handleLogin,
  handleLogout,
  handleSetOrganization,
  handleRefreshProfile,
  type AuthContext,
} from "./strata-provider/handlers/auth"
import {
  handleRequestCloudSessions,
  handleRequestCloudSessionData,
  handleImportAndSend,
  type CloudSessionContext,
} from "./strata-provider/handlers/cloud-session"
import {
  handlePermissionResponse,
  fetchAndSendPendingPermissions,
  type PermissionContext,
} from "./strata-provider/handlers/permission-handler"
import {
  handleQuestionReply,
  handleQuestionReject,
  fetchAndSendPendingQuestions,
} from "./strata-provider/handlers/question"
import { fetchAndSendPendingSuggestions, routeSuggestionWebviewMessage } from "./strata-provider/handlers/suggestion"
import { sendAcpProviderMeta, testAcpConnection } from "./stratacode/acp-test"
import { handleDocsMessage } from "./stratacode/features/docs" // stratacode_change

import {
  buildActionContext,
  computeDefaultSelection,
  fetchProviderData,
  validateRecents,
  validateFavorites,
  connectProvider as connectProviderAction,
  authorizeProviderOAuth as authorizeOAuthAction,
  completeProviderOAuth as completeOAuthAction,
  disconnectProvider as disconnectProviderAction,
  saveCustomProvider as saveCustomProviderAction,
} from "./provider-actions"
import { fetchOpenAIModels, FetchModelsError } from "./shared/fetch-models"
import type { Agent } from "@stratacode/sdk/v2/client"
import { configFeatures } from "./features"

type StrataProviderOptions = {
  projectDirectory?: string | null
  slimEditMetadata?: boolean
}

export type MessageLoadMode = "replace" | "prepend" | "focus" | "reconcile"

// Helper to map agent data to the subset of fields sent to the webview
export const mapAgent = (a: Agent) => ({
  name: a.name,
  displayName: a.displayName,
  description: a.description,
  mode: a.mode,
  native: a.native,
  hidden: a.hidden,
  color: a.color,
  deprecated: a.deprecated,
  permission: a.permission,
  model: a.model,
})

import { AutoApproveTimer } from "./strata-provider/auto-approve-timer"
import { PlanningService } from "./planning"
import { GitWatcher } from "./services/memory/GitWatcher"
import { Logger } from "./stratacode/logger"
import { WorkerStatusBar } from "./services/worker/WorkerStatusBar"
import { WorkerWatcher } from "./services/worker/WorkerWatcher"
import { isEnabled } from "./stratacode/feature-gate"
import { syncWebviewState } from "./handlers/syncWebviewState";
import { doInitializeConnection } from "./handlers/doInitializeConnection";
import { handleSyncSession } from "./handlers/handleSyncSession";
import { fetchAndSendProviders } from "./handlers/fetchAndSendProviders";
import { handleUpdateConfig } from "./handlers/handleUpdateConfig";
import { withRetry } from "./handlers/withRetry";
import { handleSendMessage } from "./handlers/handleSendMessage";
import { handleSendCommand } from "./handlers/handleSendCommand";
import { handleDiffStartThread } from "./handlers/handleDiffStartThread";
import { handleDiffReplyToThread } from "./handlers/handleDiffReplyToThread";
import { processExplanationBatches } from "./handlers/processExplanationBatches";
import { handleDiffExplainAll } from "./handlers/handleDiffExplainAll";
import { setupWebviewMessageHandler } from "./handlers/setupWebviewMessageHandler";
import { handleCreateSession } from "./handlers/handleCreateSession";
import { refreshSessionDetails } from "./handlers/refreshSessionDetails";
import { processMessagePage } from "./handlers/processMessagePage";
import { handleLoadMessages } from "./handlers/handleLoadMessages";
import { handleTerminalContext } from "./handlers/handleTerminalContext";
import { handleDeleteSession } from "./handlers/handleDeleteSession";
import { handleRenameSession } from "./handlers/handleRenameSession";
import { handleProviderAction } from "./handlers/handleProviderAction";
import { fetchAndSendAgents } from "./handlers/fetchAndSendAgents";
import { fetchAndSendSkills } from "./handlers/fetchAndSendSkills";
import { fetchAndSendCommands } from "./handlers/fetchAndSendCommands";
import { removeSkillViaCli } from "./handlers/removeSkillViaCli";
import { handleRemoveMode } from "./handlers/handleRemoveMode";
import { handleRemoveMcp } from "./handlers/handleRemoveMcp";
import { removeLegacyMcp } from "./handlers/removeLegacyMcp";
import { fetchAndSendMcpStatus } from "./handlers/fetchAndSendMcpStatus";
import { invalidateAfterMarketplaceChange } from "./handlers/invalidateAfterMarketplaceChange";
import { fetchAndSendConfig } from "./handlers/fetchAndSendConfig";
import { fetchAndSendIndexingStatus } from "./handlers/fetchAndSendIndexingStatus";
import { checkConfigWarnings } from "./handlers/checkConfigWarnings";
import { fetchAndSendNotifications } from "./handlers/fetchAndSendNotifications";
import { handleDismissNotification } from "./handlers/handleDismissNotification";
import { resolveSession } from "./handlers/resolveSession";
import { handleAbort } from "./handlers/handleAbort";
import { handleCompact } from "./handlers/handleCompact";
import { disposeGlobal } from "./handlers/disposeGlobal";
import { handlePreviewImage } from "./handlers/handlePreviewImage";
import { handleOpenFile } from "./handlers/handleOpenFile";
import { handleResetAllSettings } from "./handlers/handleResetAllSettings";
import { handleGlobalAndServerEvents } from "./handlers/handleGlobalAndServerEvents";
import { handlePromptEvents } from "./handlers/handlePromptEvents";
import { scheduleAutoApproveTimer } from "./handlers/scheduleAutoApproveTimer";
import { handleAutoApproveMessage } from "./handlers/handleAutoApproveMessage";
import { handleChildSessionEvent } from "./handlers/handleChildSessionEvent";
import { handleMessageEvent } from "./handlers/handleMessageEvent";
import { handleEvent } from "./handlers/handleEvent";
import { postMessage } from "./handlers/postMessage";
import { getOpenTabPaths } from "./handlers/getOpenTabPaths";
import { gatherRepoContext } from "./handlers/gatherRepoContext";
import { gatherEditorContext } from "./handlers/gatherEditorContext";
import { adoptPendingFollowup } from "./handlers/adoptPendingFollowup";
import { startStatsPolling } from "./handlers/startStatsPolling";
import { disposeState } from "./handlers/disposeState";

export class StrataProvider implements vscode.WebviewViewProvider, TelemetryPropertiesProvider {
  public static readonly viewType = "strata-code.SidebarProvider"
  static workerBarCreated = false
  readonly instanceId = crypto.randomUUID()
  gitWatcher?: GitWatcher
  public workerStatusBar?: WorkerStatusBar
  workerWatcher?: WorkerWatcher

  webview: vscode.Webview | null = null
  currentSession: Session | null = null
  /** Remembers the last selected session so /new can stay in the same worktree after clearSession. */
  contextSessionID: string | undefined
  /** Session used for instant AI comment threads in the Agent Manager diff viewer. */
  diffExplainSession: string | undefined
  connectionState: "connecting" | "connected" | "disconnected" | "error" = "connecting"
  loginAttempt = 0

  autoApproveTimer: AutoApproveTimer = new AutoApproveTimer(this)
  planningService: PlanningService | null = null

  isWebviewReady = false
  readonly extensionVersion =
    vscode.extensions.getExtension("stratacode.strata-code")?.packageJSON?.version ?? "unknown"
  /** Cached providersLoaded payload so requestProviders can be served before client is ready */
  cachedProvidersMessage: unknown = null
  /** Coalesce provider refreshes — at most one follow-up rerun when a request lands mid-flight. */
  providersRefresh: Promise<void> | null = null
  providersQueued = false
  providersGeneration = 0
  /** Cached agentsLoaded payload so requestAgents can be served before client is ready */
  cachedAgentsMessage: unknown = null
  /** Cached skillsLoaded payload so requestSkills can be served before client is ready */
  cachedSkillsMessage: unknown = null
  /** Cached commandsLoaded payload so requestCommands can be served before client is ready */
  cachedCommandsMessage: unknown = null
  /** Cached configLoaded payload so requestConfig can be served before client is ready */
  cachedConfigMessage: unknown = null
  /** Cached indexingStatusLoaded payload so requestIndexingStatus can be served before client is ready */
  cachedIndexingStatusMessage: unknown = null
  /** Cached mcpStatusLoaded payload so requestMcpStatus can be served before client is ready */
  cachedMcpStatusMessage: unknown = null
  /** Ref-count of in-flight handleUpdateConfig calls; prevents fetchAndSendConfig from sending stale data */
  pending = 0
  configWarningsShown = false
  /** Cached notificationsLoaded payload */
  cachedNotificationsMessage: unknown = null
  pendingReviewComments: { comments: unknown[]; autoSend: boolean }[] = []
  readyResolvers: (() => void)[] = []
  promptRecoveryQueued = false
  promptRecovery: Promise<void> | null = null
  trackedSessionIds: Set<string> = new Set()
  syncedChildSessions: Set<string> = new Set()
  /** Tracks the latest status for each session, used to warn before destructive config operations. */
  sessionStatusMap = new Map<string, SessionStatus["type"]>()
  /** Tracks sessions waiting for a message to complete */

  // Subscriptions directory overrides (e.g., worktree paths registered by AgentManagerProvider). */
  sessionDirectories = new Map<string, string>()
  /** Project ID for the current workspace, used to filter out sessions from other repositories. */
  projectID: string | undefined
  /** Abort controller for the current loadMessages request; aborted when a new session is selected. */
  loadMessagesAbort: AbortController | null = null
  /** Per-session last focus-mode reconcile timestamp — throttles rapid tab switching. */
  lastReconciledAt = new Map<string, number>()
  /** Set when refreshSessions() is called before the client is ready.
   *  Cleared and retried once the connection transitions to "connected". */
  pendingSessionRefresh = false
  readonly streams = new SessionStreamScheduler((msg) => this.postMessage(msg))
  readonly confirmations = new MessageConfirmation()
  unsubscribeEvent: (() => void) | null = null
  unsubscribeState: (() => void) | null = null
  /** Cached legacy migration data so migrate() doesn't re-read from disk/SecretStorage. */ // legacy-migration
  cachedLegacyData: import("./legacy-migration/legacy-types").LegacyMigrationData | null = null // legacy-migration
  /** Guard to prevent checkAndShowMigrationWizard running concurrently. */ // legacy-migration
  migrationCheckInFlight = false // legacy-migration
  unsubscribeNotificationDismiss: (() => void) | null = null
  unsubscribeLanguageChange: (() => void) | null = null
  unsubscribeProfileChange: (() => void) | null = null
  unsubscribeFavoritesChange: (() => void) | null = null
  unsubscribeMigrationComplete: (() => void) | null = null // legacy-migration
  unsubscribeClearPendingPrompts: (() => void) | null = null
  unsubscribeDirectoryProvider: (() => void) | null = null
  initConnectionPromise: Promise<void> | null = null
  webviewMessageDisposable: vscode.Disposable | null = null
  autocompleteConfigDisposable: vscode.Disposable | null = null
  settingsConfigDisposable: vscode.Disposable | null = null
  pluginFeaturesDisposable: vscode.Disposable | null = null
  pluginConfigSectionsDisposable: vscode.Disposable | null = null
  pluginConfigDisposable: vscode.Disposable | null = null
  pluginContributionsDisposable: vscode.Disposable | null = null
  viewStateDisposable: vscode.Disposable | null = null
  visibilityDisposable: vscode.Disposable | null = null
  /** Whether the sidebar panel is currently visible to the user. */
  sidebarVisible = false /** Reference to the WebviewView for badge updates. */
  view: vscode.WebviewView | null =
    null /** Number of pending prompts (permissions + questions) — drives the Activity Bar badge. */
  pendingPrompts = 0
  /** Lazily initialized ignore controller for .stratacodeignore filtering */
  ignoreController: FileIgnoreController | null = null
  ignoreControllerDir: string | null = null
  marketplace: MarketplaceService | null = null
  chatAutocomplete: ChatTextAreaAutocomplete | null = null
  projectDirectory: string | null | undefined
  slimEditMetadata = true

  pendingFollowup: Followup | null = null
  followupListeners: Array<(session: Session, directory: string) => void> = []
  /** Worktree diff stats poller for the sidebar badge — reuses GitStatsPoller (local stats only) */
  statsPoller: GitStatsPoller | null = null
  statsGitOps: GitOps | null = null
  cachedStats: unknown = null
  cachedGitRepo = false

  /** Optional interceptor called before the standard message handler.
   *  Return null to consume the message, or return a (possibly transformed) message. */
  onBeforeMessage: ((msg: Record<string, unknown>) => Promise<Record<string, unknown> | null>) | null = null

  /** Handler for "Continue in Worktree" — set by extension.ts to delegate to AgentManagerProvider. */
  continueInWorktreeHandler:
    | ((sessionId: string, progress: (status: string, detail?: string, error?: string) => void) => Promise<void>)
    | null = null

  /** Handler for sidebar worktree creation — delegates to AgentManagerProvider. */
  createWorktreeHandler: ((baseBranch?: string, branchName?: string) => Promise<void>) | null = null

  diffVirtualProvider: import("./DiffVirtualProvider").DiffVirtualProvider | undefined
  remoteService: RemoteStatusService | null = null
  unsubscribeRemote: (() => void) | null = null

  readonly _onDidRegisterSession = new vscode.EventEmitter<Session>()
  public readonly onDidRegisterSession = this._onDidRegisterSession.event

  constructor(
    public readonly extensionUri: vscode.Uri,
    public readonly connectionService: StrataConnectionService,
    public readonly extensionContext?: vscode.ExtensionContext,
    options?: StrataProviderOptions,
  ) {
    this.projectDirectory = options?.projectDirectory
    this.slimEditMetadata = options?.slimEditMetadata ?? true

    TelemetryProxy.getInstance().setProvider(this)

    if (this.extensionContext) {
      if (isEnabled("planningMode")) {
        // stratacode_change
        this.planningService = new PlanningService({
          context: this.extensionContext,
          connectionService: this.connectionService,
          postToSidebar: (msg) => this.postMessage(msg),
        })
      } // stratacode_change
    }

    this.gitWatcher = new GitWatcher(this)
    if (!StrataProvider.workerBarCreated) {
      StrataProvider.workerBarCreated = true
      this.workerStatusBar = new WorkerStatusBar(this)
    }
    this.workerWatcher = new WorkerWatcher(this)
  }

  setRemoteService(service: RemoteStatusService): void {
    this.remoteService = service
    this.unsubscribeRemote = service.onChange(() => this.sendRemoteStatus())
  }
  sendRemoteStatus(): void {
    const s = this.remoteService?.getState()
    if (s) this.postMessage({ type: "remoteStatus", enabled: s.enabled, connected: s.connected })
  }
  focusSession(id?: string): void {
    this.streams.focus(id)
    if (id) this.connectionService.registerFocused(this.instanceId, id)
    else this.connectionService.unregisterFocused(this.instanceId)
  }

  public setProjectDirectory(directory: string | null): void {
    if (this.projectDirectory === directory) return
    this.projectDirectory = directory
    this.postMessage({ type: "workspaceDirectoryChanged", directory: directory ?? "" })
  }

  public setDiffVirtualProvider(provider: import("./DiffVirtualProvider").DiffVirtualProvider): void {
    this.diffVirtualProvider = provider
  }

  getTelemetryProperties(): Record<string, unknown> {
    return {
      appName: "strata-code",
      appVersion: this.extensionVersion,
      platform: "vscode",
      editorName: vscode.env.appName,
      vscodeVersion: vscode.version,
      machineId: vscode.env.machineId,
      vscodeIsTelemetryEnabled: vscode.env.isTelemetryEnabled,
    }
  }

  /**
   * Convenience getter that returns the shared SDK StrataClient or null if not yet connected.
   * Preserves the existing null-check pattern used throughout handler methods.
   */
  public get client(): StrataClient | null {
    try {
      return this.connectionService.getClient()
    } catch (err) {
      Logger.debug("StrataProvider", "client unavailable:", err)
      return null
    }
  }

  /** Hide a session from the chat/sidebar UI (e.g. explainer sessions). */
  public hideSession(sessionId: string): void {
    this.connectionService.hideSession(sessionId)
  }

  /** Unhide a session previously hidden via hideSession(). */
  public unhideSession(sessionId: string): void {
    this.connectionService.unhideSession(sessionId)
  }

  // Strip edit-tool metadata.filediff.before/after (multi-MB for edit-heavy
  // sessions) to keep session switches fast. Logic in strata-provider/slim-metadata.ts.
  slimPart<T>(part: T): T {
    if (!this.slimEditMetadata) return part
    return slimPart(part)
  }

  slimParts<T>(parts: T[]) {
    if (!this.slimEditMetadata) return parts
    return slimParts(parts)
  }

  get forkCtx() {
    return {
      connection: this.connectionService,
      post: (msg: { type: "error"; message: string }) => this.postMessage(msg),
      register: (session: Session) => this.registerSession(session),
      forked: (session: Session) => this.postMessage({ type: "sessionForked", sessionID: session.id }),
      status: (sessionID: string) => this.sessionStatusMap.get(sessionID),
      directory: (sessionID: string) => this.getWorkspaceDirectory(sessionID),
    }
  }

  async syncWebviewState(reason: string): Promise<void> {
      return syncWebviewState(this, reason);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    // Store the webview references
    this.isWebviewReady = false
    this.webview = webviewView.webview

    // Set up webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)
    this.setupWebviewMessageHandler(webviewView.webview)

    this.view = webviewView
    this.sidebarVisible = webviewView.visible
    vscode.commands.executeCommand("setContext", "strata-code.new.sidebarVisible", webviewView.visible)
    this.visibilityDisposable?.dispose()
    this.visibilityDisposable = webviewView.onDidChangeVisibility(() => {
      this.sidebarVisible = webviewView.visible
      vscode.commands.executeCommand("setContext", "strata-code.new.sidebarVisible", webviewView.visible)
      if (this.statsPoller) {
        this.statsPoller.setEnabled(webviewView.visible)
        this.statsPoller.setVisible(webviewView.visible)
      }

      if (webviewView.visible && this.pendingPrompts > 0) {
        this.pendingPrompts = 0
        this.updateBadge()
      }

      this.focusSession(webviewView.visible ? this.currentSession?.id : undefined)
    })
    this.initializeConnection()
  }

  /**
   * Resolve a WebviewPanel for displaying the Strata webview in an editor tab.
   */
  public resolveWebviewPanel(panel: vscode.WebviewPanel): void {
    // WebviewPanel can be restored/reloaded; ensure we don't treat it as ready prematurely.
    this.isWebviewReady = false
    this.webview = panel.webview

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    }

    panel.webview.html = this._getHtmlForWebview(panel.webview)

    this.setupWebviewMessageHandler(panel.webview)
    this.viewStateDisposable?.dispose()
    this.viewStateDisposable = panel.onDidChangeViewState(() =>
      this.focusSession(panel.active ? this.currentSession?.id : undefined),
    )
    this.initializeConnection()
  }

  /**
   * Register a session created externally (e.g., worktree sessions from AgentManagerProvider).
   * Sets currentSession, adds to trackedSessionIds, and notifies the webview.
   */
  public registerSession(session: Session): void {
    this.currentSession = session
    this.contextSessionID = session.id
    this.trackedSessionIds.add(session.id)
    this.postMessage({
      type: "sessionCreated",
      session: this.sessionToWebview(session),
    })
    this._onDidRegisterSession.fire(session)
  }

  /**
   * Add a session ID to the tracked set without changing currentSession.
   * Used to re-register worktree sessions after clearSession wipes the set.
   */
  public trackSession(sessionId: string): void {
    this.trackedSessionIds.add(sessionId)
  }

  public loadMessages(sessionID: string): Promise<void> {
    // Sub-agent viewer: full transcript (no "load earlier" UI, no pagination).
    return this.handleLoadMessages(sessionID, { limit: 0 })
  }

  /**
   * Register a directory override for a session (e.g., worktree path).
   * When set, all operations for this session use this directory instead of the workspace root.
   */
  public setSessionDirectory(sessionId: string, directory: string): void {
    this.sessionDirectories.set(sessionId, directory)
  }

  public clearSessionDirectory(sessionId: string): void {
    this.sessionDirectories.delete(sessionId)
  }

  /** Exposes the session→directory map so callers outside the webview can resolve worktree paths. */
  public getSessionDirectories(): ReadonlyMap<string, string> {
    return this.sessionDirectories
  }

  /** Return the currently active session ID, if any. */
  public getCurrentSessionId(): string | undefined {
    return this.currentSession?.id ?? undefined
  }

  /**
   * Re-fetch and send the full session list to the webview.
   * Called by AgentManagerProvider after worktree recovery completes.
   */
  public refreshSessions(): void {
    void this.handleLoadSessions()
  }

  /** Register a listener invoked when a plan follow-up session is adopted. */
  public onFollowupAdopted(cb: (session: Session, directory: string) => void): void {
    this.followupListeners.push(cb)
  }

  /** Recover permission/question prompts after sessions and directories are tracked. */
  public recoverPendingPrompts(): void {
    this.promptRecoveryQueued = true
    if (!this.isWebviewReady) return
    if (!this.client) return
    if (this.promptRecovery) return

    this.promptRecovery = this.flushPendingPrompts().finally(() => {
      this.promptRecovery = null
      if (this.promptRecoveryQueued && this.isWebviewReady && this.client) this.recoverPendingPrompts()
    })
  }

  async flushPendingPrompts(): Promise<void> {
    while (this.promptRecoveryQueued && this.isWebviewReady) {
      if (!this.client) return
      this.promptRecoveryQueued = false
      await Promise.all([
        fetchAndSendPendingPermissions(this.permissionCtx),
        fetchAndSendPendingQuestions(this.questionCtx),
        fetchAndSendPendingSuggestions(this.questionCtx),
      ])
    }
  }

  public openCloudSession(sessionId: string): void {
    this.postMessage({ type: "openCloudSession", sessionId })
  }

  public setContinueInWorktreeHandler(
    handler: (sessionId: string, progress: (status: string, detail?: string, error?: string) => void) => Promise<void>,
  ): void {
    this.continueInWorktreeHandler = handler
  }

  public setCreateWorktreeHandler(handler: (baseBranch?: string, branchName?: string) => Promise<void>): void {
    this.createWorktreeHandler = handler
  }

  public attachToWebview(
    webview: vscode.Webview,
    options?: { onBeforeMessage?: (msg: Record<string, unknown>) => Promise<Record<string, unknown> | null> },
  ): void {
    this.isWebviewReady = false
    this.webview = webview
    this.onBeforeMessage = options?.onBeforeMessage ?? null
    this.setupWebviewMessageHandler(webview)
    this.initializeConnection()
  }

  setupWebviewMessageHandler(webview: vscode.Webview): void {
      return setupWebviewMessageHandler(this, webview);
  }

  openExternal(url: unknown): void {
    if (typeof url !== "string") return
    void vscode.env.openExternal(vscode.Uri.parse(url))
  }

  openDiffVirtual(diff: unknown, initialDiffStyle?: unknown): void {
    if (!this.diffVirtualProvider || !diff) return
    const d = diff as import("./DiffVirtualProvider").DiffVirtualFile
    d.initialDiffStyle = initialDiffStyle === "split" ? "split" : "unified"
    this.diffVirtualProvider.open(d)
  }

  /**
   * Initialize connection to the CLI backend server.
   * Subscribes to the shared StrataConnectionService.
   */
  initializeConnection(): Promise<void> {
    if (this.initConnectionPromise) {
      return this.initConnectionPromise
    }
    this.initConnectionPromise = this.doInitializeConnection().finally(() => {
      this.initConnectionPromise = null
    })
    return this.initConnectionPromise
  }

  async doInitializeConnection(): Promise<void> {
      return doInitializeConnection(this);
  }

  sessionToWebview(session: Session) {
    return sessionToWebview(session)
  }

  async handleCreateSession(): Promise<void> {
      return handleCreateSession(this);
  }

  /** Non-blocking: refresh session metadata + status for the webview after switching. */
  refreshSessionDetails(sessionID: string, dir: string, signal?: AbortSignal): void {
      return refreshSessionDetails(this, sessionID, dir, signal);
  }

  async processMessagePage(
    sessionID: string,
    dir: string,
    mode: MessageLoadMode,
    limit: number,
    before?: string,
    abort?: AbortController,
  ): Promise<void> {
      return processMessagePage(this, sessionID, dir, mode, limit, before, abort);
  }

  async handleLoadMessages(
    sessionID: string,
    options: { mode?: MessageLoadMode; before?: string; limit?: number } = {},
  ): Promise<void> {
      return handleLoadMessages(this, sessionID, options);
  }

  /**
   * Handle syncing a child session (e.g. spawned by the task tool).
   * Tracks the session for SSE events and fetches its messages.
   */
  async handleSyncSession(sessionID: string, parentSessionID?: string): Promise<void> {
      return handleSyncSession(this, sessionID, parentSessionID);
  }

  /**
   * Build the context object used by the extracted session-refresh helpers.
   */
  get sessionRefreshContext(): SessionRefreshContext {
    const client = this.client
    return {
      pendingSessionRefresh: this.pendingSessionRefresh,
      connectionState: this.connectionState,
      listSessions: client
        ? (dir: string) =>
            client.session.list({ directory: dir, roots: true }, { throwOnError: true }).then(({ data }) => data)
        : null,
      sessionDirectories: this.sessionDirectories,
      workspaceDirectory: this.getWorkspaceDirectory(),
      postMessage: (msg: unknown) => this.postMessage(msg),
    }
  }

  /**
   * Retry a deferred sessions refresh once the client is ready.
   */
  async flushPendingSessionRefresh(reason: string): Promise<void> {
    if (!this.pendingSessionRefresh) return
    Logger.info("StrataProvider", "🔄 Flushing deferred sessions refresh", { reason })
    const ctx = this.sessionRefreshContext
    try {
      const resolved = await flushPendingSessionRefreshUtil(ctx)
      if (resolved) this.projectID = resolved
    } catch (error) {
      Logger.error("StrataProvider", "Failed to flush session refresh:", error)
    }
    this.pendingSessionRefresh = ctx.pendingSessionRefresh
  }

  /**
   * Handle loading all sessions.
   */
  async handleLoadSessions(): Promise<void> {
    const ctx = this.sessionRefreshContext
    try {
      const resolved = await loadSessionsUtil(ctx)
      if (resolved) this.projectID = resolved
    } catch (error) {
      Logger.error("StrataProvider", "Failed to load sessions:", error)
      this.postMessage({
        type: "error",
        message: getErrorMessage(error) || "Failed to load sessions",
      })
    }
    this.pendingSessionRefresh = ctx.pendingSessionRefresh
  }

  async handleTerminalContext(requestId: string): Promise<void> {
      return handleTerminalContext(this, requestId);
  }

  /**
   * Handle deleting a session.
   */
  async handleDeleteSession(sessionID: string): Promise<void> {
      return handleDeleteSession(this, sessionID);
  }

  /**
   * Handle renaming a session.
   */
  async handleRenameSession(sessionID: string, title: string): Promise<void> {
      return handleRenameSession(this, sessionID, title);
  }

  /** Fetch providers and send to webview. Coalesced: at most one in-flight + one queued. */
  async fetchAndSendProviders(): Promise<void> {
      return fetchAndSendProviders(this);
  }

  async handleProviderAction(msg: Record<string, unknown>): Promise<void> {
      return handleProviderAction(this, msg);
  }

  async handleFetchCustomProviderModels(msg: Record<string, unknown>): Promise<void> {
    const rid = typeof msg.requestId === "string" ? msg.requestId : ""
    const url = typeof msg.baseURL === "string" ? msg.baseURL : ""
    if (!rid || !url) return
    const key = typeof msg.apiKey === "string" ? msg.apiKey : undefined
    const headers = msg.headers && typeof msg.headers === "object" ? (msg.headers as Record<string, string>) : undefined
    try {
      const models = await fetchOpenAIModels({ baseURL: url, apiKey: key, headers })
      this.postMessage({ type: "customProviderModelsFetched", requestId: rid, models })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch models"
      const auth = err instanceof FetchModelsError && err.auth
      this.postMessage({ type: "customProviderModelsFetched", requestId: rid, error: message, auth })
    }
  }

  /**
   * Fetch agents (modes) from the backend and send to webview.
   */
  async fetchAndSendAgents(): Promise<void> {
      return fetchAndSendAgents(this);
  }

  async fetchAndSendSkills(): Promise<void> {
      return fetchAndSendSkills(this);
  }

  clearCommandsCache(): void {
    this.cachedCommandsMessage = null
    clearCommandsCache()
  }

  async fetchAndSendCommands(): Promise<void> {
      return fetchAndSendCommands(this);
  }

  async fetchCliSkills(): Promise<Array<{ name: string; location: string }> | undefined> {
    if (!this.client) return undefined
    try {
      const dir = this.getWorkspaceDirectory()
      const { data } = await retry(() => this.client!.app.skills({ directory: dir }, { throwOnError: true }))
      return data
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch CLI skills for marketplace:", error)
      return undefined
    }
  }

  /**
   * Remove a skill via the CLI backend (deletes from disk + clears cache), then refresh.
   * Returns true on success, false on failure.
   * On failure, re-fetches skills so the webview reverts to the authoritative state.
   */
  async removeSkillViaCli(location: string): Promise<boolean> {
      return removeSkillViaCli(this, location);
  }

  /**
   * Remove a custom mode via the CLI backend (deletes from disk + refreshes state).
   * The webview optimistically removes the mode from its list before this runs.
   * On failure, re-fetches agents so the webview reverts to the authoritative state.
   *
   * Agents can exist in multiple places simultaneously:
   * - .md files in config directories (handled by CLI removeAgent)
   * - Legacy .stratacodemodes YAML files (handled by CLI removeAgent)
   * - Global strata.jsonc agent config entries (handled via CLI config.update)
   * - Project .strata/strata.json agent entries (handled by marketplace removal)
   * We attempt ALL paths so nothing is left behind.
   */
  async handleRemoveMode(name: string): Promise<void> {
      return handleRemoveMode(this, name);
  }

  async handleRemoveMcp(name: string): Promise<void> {
      return handleRemoveMcp(this, name);
  }

  /**
   * Remove an MCP server from legacy config files (.strata/mcp.json, .stratacode/mcp.json,
   * and the VS Code global storage mcp_settings.json). These files are read by the
   * CLI-side McpMigrator and merged into config at the lowest precedence level.
   * Returns true if the entry was found and removed from at least one file.
   */
  async removeLegacyMcp(name: string): Promise<boolean> {
      return removeLegacyMcp(this, name);
  }

  async fetchAndSendMcpStatus(): Promise<void> {
      return fetchAndSendMcpStatus(this);
  }

  async handleConnectMcp(name: string): Promise<void> {
    if (!this.client) return
    try {
      const directory = this.getWorkspaceDirectory()
      await this.client.mcp.connect({ name, directory })
      await this.fetchAndSendMcpStatus()
    } catch (error) {
      Logger.error("StrataProvider", `Failed to connect MCP: ${name}`, error)
      await this.fetchAndSendMcpStatus()
    }
  }

  async handleDisconnectMcp(name: string): Promise<void> {
    if (!this.client) return
    try {
      const directory = this.getWorkspaceDirectory()
      await this.client.mcp.disconnect({ name, directory })
      await this.fetchAndSendMcpStatus()
    } catch (error) {
      Logger.error("StrataProvider", `Failed to disconnect MCP: ${name}`, error)
      await this.fetchAndSendMcpStatus()
    }
  }

  /**
   * Remove a marketplace item from a single scope and invalidate CLI caches.
   */
  async removeMarketplaceItem(item: MarketplaceItem, scope: "project" | "global"): Promise<RemoveResult> {
    const workspace = this.getProjectDirectory(this.currentSession?.id)
    const result = await this.getMarketplace().remove(item, scope, workspace)
    if (result.success) {
      await this.invalidateAfterMarketplaceChange(scope)
    }
    return result
  }

  /**
   * Remove a marketplace item from both project and global scopes.
   * mp.remove returns success even when the entry doesn't exist (no-op),
   * so we must attempt both scopes to cover dual-scope installations.
   * Returns true if at least one scope removal succeeded.
   */
  async removeMarketplaceItemFromAllScopes(item: MarketplaceItem): Promise<boolean> {
    const workspace = this.getProjectDirectory(this.currentSession?.id)
    const mp = this.getMarketplace()
    const project = await mp.remove(item, "project", workspace)
    const global = await mp.remove(item, "global", workspace)

    if (project.success || global.success) {
      const scope = global.success ? "global" : "project"
      await this.invalidateAfterMarketplaceChange(scope)
      return true
    }
    return false
  }

  /**
   * Invalidate CLI caches and refresh the webview after a marketplace install/remove.
   *
   * For global scope: uses global.config.update with the freshly-written config file
   * contents rather than global.dispose. This goes through Config.updateGlobal() which
   * calls Config.global.reset() to invalidate the lazy-cached global config, ensuring
   * the newly installed/removed MCP entry is visible on the next config.get call.
   * (global.dispose alone is not sufficient on older CLI versions that lack the
   * Config.global.reset() call in the dispose handler.)
   *
   * For project scope: instance.dispose is sufficient because the per-instance
   * Config.state is cleared and re-reads all files (including global) on next access.
   */
  async invalidateAfterMarketplaceChange(scope: "project" | "global"): Promise<void> {
      return invalidateAfterMarketplaceChange(this, scope);
  }

  /**
   * Fetch backend config and send to webview.
   */
  async fetchAndSendConfig(): Promise<void> {
      return fetchAndSendConfig(this);
  }

  /** Fetch global-only config (no project/managed layers) for settings export. */
  async fetchAndSendGlobalConfig(): Promise<void> {
    if (!this.client || this.connectionState !== "connected") return
    try {
      const { data: config } = await this.client.global.config.get({ throwOnError: true })
      this.postMessage({ type: "globalConfigLoaded", config })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch global config:", error)
    }
  }

  async fetchAndSendIndexingStatus(): Promise<void> {
      return fetchAndSendIndexingStatus(this);
  }

  /**
   * Seed sessionStatusMap with current session statuses on connect.
   * Without this, the Settings panel (which has no tracked sessions) would see
   * busyCount() = 0 for sessions that were already running before it opened.
   *
   * @param reconcile When true, reset locally-busy sessions absent from the
   *   server response to idle (crash recovery). Set to false on SSE reconnects
   *   to avoid a race where a brief HTTP fetch gap causes the spinner to vanish.
   */
  async seedSessionStatusMap(reconcile = true): Promise<void> {
    if (!this.client || this.connectionState !== "connected") return
    const dir = this.getWorkspaceDirectory()
    await seedSessionStatuses(this.client, dir, this.sessionStatusMap, (msg) => this.postMessage(msg), reconcile)
  }

  /**
   * Fetch the latest merged config and push it as configUpdated.
   * Called when global.config.updated SSE fires (config changed without a full dispose).
   */
  async fetchAndSendConfigUpdated(): Promise<void> {
    if (!this.client || this.connectionState !== "connected") return
    try {
      const dir = this.getWorkspaceDirectory()
      const { data: config } = await retry(() => this.client!.config.get({ directory: dir }, { throwOnError: true }))
      this.cachedConfigMessage = { type: "configLoaded", config, features: configFeatures(config) }
      this.postMessage({ type: "configUpdated", config, features: configFeatures(config) })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch config after update:", error)
    }
  }

  /**
   * Fetch config warnings from the server and display a single consolidated
   * VS Code warning with a "Show Details" action button.
   * Only shown once per provider lifecycle (flag resets on dispose/re-create, not on SSE reconnect).
   */
  async checkConfigWarnings(from: string): Promise<void> {
      return checkConfigWarnings(this, from);
  }

  /**
   * Fetch Strata news/notifications and send to webview.
   * Uses the cached message pattern so the webview gets data immediately on refresh.
   */
  async fetchAndSendNotifications(): Promise<void> {
      return fetchAndSendNotifications(this);
  }

  // Cloud session methods extracted to strata-provider/handlers/cloud-session.ts

  /**
   * Persist a dismissed notification ID in globalState and push updated lists to webview.
   */
  async handleDismissNotification(notificationId: string): Promise<void> {
      return handleDismissNotification(this, notificationId);
  }

  /**
   * Read notification/sound settings from VS Code config and push to webview.
   */
  sendNotificationSettings(): void {
    const notifications = vscode.workspace.getConfiguration("strata-code.new.notifications")
    const sounds = vscode.workspace.getConfiguration("strata-code.new.sounds")
    this.postMessage({
      type: "notificationSettingsLoaded",
      settings: {
        notifyAgent: notifications.get<boolean>("agent", true),
        notifyPermissions: notifications.get<boolean>("permissions", true),
        notifyErrors: notifications.get<boolean>("errors", true),
        soundAgent: sounds.get<string>("agent", "default"),
        soundPermissions: sounds.get<string>("permissions", "default"),
        soundErrors: sounds.get<string>("errors", "default"),
      },
    })
  }

  sendTimelineSetting(): void {
    const config = vscode.workspace.getConfiguration("strata-code.new")
    this.postMessage({
      type: "timelineSettingLoaded",
      visible: config.get<boolean>("features.taskTimeline", true),
    })
  }

  /** Returns the number of sessions currently in "busy" state. */
  getBusySessionCount(): number {
    return getBusySessionCount(this.sessionStatusMap)
  }

  /**
   * Handle config update request from the webview.
   * Applies a partial config update via the global config endpoint, then pushes
   * the full merged config back to the webview.
   */
  async handleUpdateConfig(partial: Partial<Config>): Promise<void> {
      return handleUpdateConfig(this, partial);
  }

  /**
   * Ensure a session exists, creating one if needed. Returns the resolved
   * session ID and workspace directory, or undefined when the client is
   * disconnected.
   */
  async resolveSession(
    sessionID?: string,
    draftID?: string,
  ): Promise<{ sid: string; dir: string } | undefined> {
      return resolveSession(this, sessionID, draftID);
  }

  /** Abort controllers for active retry loops, keyed by session ID */
  retryAbortControllers = new Map<string, AbortController>()

  /** Execute an SDK call with visible exponential backoff for retryable HTTP errors. */
  async withRetry(
    fn: () => Promise<{ error?: unknown; response?: Response }>,
    sid: string,
    messageID?: string,
  ): Promise<void> {
      return withRetry(this, fn, sid, messageID);
  }

  /** Cancel an active retry loop for a session */
  cancelRetry(sid: string): void {
    const controller = this.retryAbortControllers.get(sid)
    if (controller) {
      controller.abort()
      this.postMessage({ type: "sessionStatus", sessionID: sid, status: "idle" })
    }
  }

  public async handleSendMessage(
    text: string,
    messageID?: string,
    sessionID?: string,
    draftID?: string,
    providerID?: string,
    modelID?: string,
    agent?: string,
    variant?: string,
    files?: MessageFile[],
  ): Promise<void> {
      return handleSendMessage(this, text, messageID, sessionID, draftID, providerID, modelID, agent, variant, files);
  }

  async handleSendCommand(
    command: string,
    args: string,
    messageID?: string,
    sessionID?: string,
    draftID?: string,
    providerID?: string,
    modelID?: string,
    agent?: string,
    variant?: string,
    files?: MessageFile[],
  ): Promise<void> {
      return handleSendCommand(this, command, args, messageID, sessionID, draftID, providerID, modelID, agent, variant, files);
  }

  async handleAbort(sessionID?: string): Promise<void> {
      return handleAbort(this, sessionID);
  }

  async handleRevertSession(sessionID: string, messageID: string): Promise<void> {
    if (!this.client) return
    const dir = this.getWorkspaceDirectory(sessionID)
    const { data, error } = await this.client.session.revert({ sessionID, messageID, directory: dir })
    if (error) {
      Logger.error("StrataProvider", "Failed to revert session:", error)
      this.postMessage({ type: "error", message: "Failed to revert session", sessionID })
      return
    }
    if (data) this.postMessage({ type: "sessionUpdated", session: sessionToWebview(data) })
  }

  async handleUnrevertSession(sessionID: string): Promise<void> {
    if (!this.client) return
    const dir = this.getWorkspaceDirectory(sessionID)
    const { data, error } = await this.client.session.unrevert({ sessionID, directory: dir })
    if (error) {
      Logger.error("StrataProvider", "Failed to unrevert session:", error)
      this.postMessage({ type: "error", message: "Failed to redo session", sessionID })
      return
    }
    if (data) this.postMessage({ type: "sessionUpdated", session: sessionToWebview(data) })
  }

  /**
   * Handle compact (context summarization) request from the webview.
   */
  async handleCompact(sessionID?: string, providerID?: string, modelID?: string): Promise<void> {
      return handleCompact(this, sessionID, providerID, modelID);
  }

  // Permission + question handlers extracted to strata-provider/handlers/permission.ts and question.ts

  get permissionCtx(): PermissionContext {
    return {
      client: this.client,
      currentSessionId: this.currentSession?.id,
      trackedSessionIds: this.trackedSessionIds,
      sessionDirectories: this.sessionDirectories,
      postMessage: (msg) => this.postMessage(msg),
      getWorkspaceDirectory: (sid) => this.getWorkspaceDirectory(sid),
    }
  }

  get questionCtx() {
    return {
      client: this.client,
      currentSessionId: this.currentSession?.id,
      trackedSessionIds: this.trackedSessionIds,
      sessionDirectories: this.sessionDirectories,
      postMessage: (msg: unknown) => this.postMessage(msg),
      getWorkspaceDirectory: (sid?: string) => this.getWorkspaceDirectory(sid),
    }
  }

  // Cloud session handlers extracted to strata-provider/handlers/cloud-session.ts

  get cloudSessionCtx(): CloudSessionContext {
    const self = this
    return {
      client: this.client,
      get currentSession() {
        return self.currentSession
      },
      set currentSession(session) {
        self.currentSession = session
        if (session) self.contextSessionID = session.id
      },
      trackedSessionIds: this.trackedSessionIds,
      connectionService: this.connectionService,
      postMessage: (msg) => this.postMessage(msg),
      getWorkspaceDirectory: (sid) => this.getWorkspaceDirectory(sid),
      gatherEditorContext: () => this.gatherEditorContext(),
      runWithMessageConfirmation: (id, label, run) => runWithMessageConfirmation(this.confirmations, id, label, run),
    }
  }

  // Auth handlers extracted to strata-provider/handlers/auth.ts

  get authCtx(): AuthContext {
    return {
      client: this.client,
      postMessage: (msg) => this.postMessage(msg),
      getWorkspaceDirectory: () => this.getWorkspaceDirectory(),
      disposeGlobal: () => this.disposeGlobal(),
      fetchAndSendProviders: () => this.fetchAndSendProviders(),
      fetchAndSendAgents: () => this.fetchAndSendAgents(),
    }
  }

  async disposeGlobal(): Promise<void> {
      return disposeGlobal(this);
  }

  handlePreviewImage(dataUrl: string, filename: string): void {
      return handlePreviewImage(this, dataUrl, filename);
  }

  /**
   * Handle openFile request from the webview — open a file in the VS Code editor.
   * Resolves relative paths against the current session's directory (which may be
   * a worktree path registered via setSessionDirectory), falling back to workspace root.
   * Absolute paths (Unix `/…` or Windows `C:\…`) are used as-is.
   */
  handleOpenFile(filePath: string, line?: number, column?: number): void {
      return handleOpenFile(this, filePath, line, column);
  }

  /**
   * Handle a generic setting update from the webview.
   * The key uses dot notation relative to `strata-code.new` (e.g. "browserAutomation.enabled").
   */
  handleRequestSetting(key: string): void {
    const { section, leaf } = buildSettingPath(key)
    const config = vscode.workspace.getConfiguration(`strata-code.new${section ? `.${section}` : ""}`)
    const value = config.get(leaf)
    Logger.info("StrataProvider", `handleRequestSetting: ${key} →`, value)
    Logger.info("StrataProvider", `handleRequestSetting: webview=${!!this.webview}, isReady=${this.isWebviewReady}`)
    this.postMessage({
      type: "settingLoaded",
      key,
      value,
    })
    Logger.info("StrataProvider", `handleRequestSetting: postMessage(settingLoaded) called for ${key}`)
  }

  async handleDiffStartThread(
    threadId: string,
    file: string,
    line: number,
    endLine: number | undefined,
    text: string,
    side?: "left" | "right",
  ): Promise<void> {
      return handleDiffStartThread(this, threadId, file, line, endLine, text, side);
  }

  async handleDiffReplyToThread(threadId: string, text: string): Promise<void> {
      return handleDiffReplyToThread(this, threadId, text);
  }

  async processExplanationBatches(
    client: any,
    targetDirectory: string,
    validDiffs: { file: string; patch: string }[],
    sessionContext?: string
  ): Promise<void> {
      return processExplanationBatches(this, client, targetDirectory, validDiffs, sessionContext);
  }

  async handleDiffExplainAll(message: any): Promise<void> {
      return handleDiffExplainAll(this, message);
  }

  async handleUpdateSetting(key: string, value: unknown): Promise<void> {
    const { section, leaf } = buildSettingPath(key)
    const config = vscode.workspace.getConfiguration(`strata-code.new${section ? `.${section}` : ""}`)
    await config.update(leaf, value, vscode.ConfigurationTarget.Global)
    if (key.startsWith("features.")) {
      this.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
      // Sync runtime keys for features that have separate service toggles
      if (key === "features.browserAutomation") {
        await vscode.workspace
          .getConfiguration("strata-code.new.browserAutomation")
          .update("enabled", value, vscode.ConfigurationTarget.Global)
      }
    }
  }

  /**
   * Reset all "strata-code.new.*" extension settings to their defaults by reading
   * contributes.configuration from the extension's package.json at runtime.
   * Only resets settings under the "strata-code.new." namespace to avoid touching
   * settings from the previous version of the extension which shares the same
   * extension ID and "strata-code.*" namespace.
   */
  async handleResetAllSettings(): Promise<void> {
      return handleResetAllSettings(this);
  }

  /**
   * Read the current browser automation settings and push them to the webview.
   */
  sendBrowserSettings(): void {
    const config = vscode.workspace.getConfiguration("strata-code.new.browserAutomation")
    this.postMessage({
      type: "browserSettingsLoaded",
      settings: {
        enabled: config.get<boolean>("enabled", false),
        useSystemChrome: config.get<boolean>("useSystemChrome", true),
        headless: config.get<boolean>("headless", false),
      },
    })
  }

  /**
   * Read the current Claude Code compatibility setting and push it to the webview.
   */
  sendClaudeCompatSetting(): void {
    const enabled = vscode.workspace.getConfiguration("strata-code.new").get<boolean>("claudeCodeCompat", false)
    this.postMessage({
      type: "claudeCompatSettingLoaded",
      enabled: enabled ?? false,
    })
  }

  /** Re-fetch all server-side state after an auth change. */
  async reloadAfterAuthChange(): Promise<void> {
    await this.fetchAndSendConfig()
    await Promise.all([
      this.fetchAndSendProviders(),
      this.fetchAndSendAgents(),
      this.fetchAndSendSkills(),
      this.fetchAndSendCommands(),
      this.fetchAndSendIndexingStatus(),
      this.fetchAndSendNotifications(),
    ])
  }

  /**
   * Handle SSE events from the CLI backend.
   * Filters events by project ID and tracked session IDs so each webview only sees its own sessions.
   */
  handleWorkerEvent(workerEvent: any): boolean {
    if (
      workerEvent.type === "worker.started" ||
      workerEvent.type === "worker.completed" ||
      workerEvent.type === "worker.failed"
    ) {
      this.workerStatusBar?.update(workerEvent)
      if (workerEvent.type === "worker.completed" && workerEvent.properties?.worker === "explainer_worker") {
        this.postMessage({ type: "diffViewer.explainResult", ...workerEvent.properties.result })
      }
      return true
    }
    return false
  }

  handleSessionStatusEvent(event: Extract<Event, { type: "session.status" }>, sessionID: string): void {
    this.sessionStatusMap.set(sessionID, event.properties.status.type)
    checkCompletion(sessionID, event.properties.status.type)

    const msg = mapSSEEventToWebviewMessage(event, sessionID)
    if (msg) {
      this.streams.flush(sessionID)
      this.postMessage(msg)
    }
  }

  handleGlobalAndServerEvents(event: Event): boolean {
      return handleGlobalAndServerEvents(this, event);
  }

  handleSessionLifecycleEvents(event: Event): void {
    if (event.type === "session.created" && !this.currentSession) {
      this.currentSession = event.properties.info
      this.contextSessionID = event.properties.info.id
      this.trackedSessionIds.add(event.properties.info.id)
    }
    if (event.type === "session.updated" && this.currentSession?.id === event.properties.info.id) {
      this.currentSession = event.properties.info
      this.contextSessionID = event.properties.info.id
    }
  }

  handlePromptEvents(event: Event): void {
      return handlePromptEvents(this, event);
  }

  scheduleAutoApproveTimer(msg: any, config: any, agentName: string, isQuestion: boolean) {
      return scheduleAutoApproveTimer(this, msg, config, agentName, isQuestion);
  }

  handleAutoApproveMessage(msg: any): void {
      return handleAutoApproveMessage(this, msg);
  }

  handleChildSessionEvent(event: Event, sessionID?: string): void {
      return handleChildSessionEvent(this, event, sessionID);
  }

  isEventDropped(event: Event, sessionID: string | undefined): boolean {
    if (isEventFromForeignProject(event, this.projectID)) return true
    if (sessionID && this.connectionService.isSessionHidden(sessionID)) return true
    if (event.type === "session.created" && this.connectionService.isSessionHidden(event.properties.info.id)) return true
    if (!sessionID && (event.type === "message.part.updated" || event.type === "message.part.delta")) return true
    if (event.type !== "indexing.status" && sessionID && !this.trackedSessionIds.has(sessionID)) return true
    return false
  }

  handleMessageEvent(event: Event, sessionID: string | undefined, directory?: string): void {
      return handleMessageEvent(this, event, sessionID, directory);
  }

  handleEvent(event: Event, directory?: string): void {
      return handleEvent(this, event, directory);
  }

  /** Set or clear the Activity Bar badge based on pending prompt count. */
  updateBadge(): void {
    if (!this.view) return
    this.view.badge =
      this.pendingPrompts > 0
        ? {
            value: this.pendingPrompts,
            tooltip: `${this.pendingPrompts} action${this.pendingPrompts > 1 ? "s" : ""} needed`,
          }
        : undefined
  }

  /** Wait until the webview has sent "webviewReady". Resolves immediately when already ready. */
  public waitForReady(): Promise<void> {
    return this.isWebviewReady && this.webview ? Promise.resolve() : new Promise((r) => this.readyResolvers.push(r))
  }
  /** Post a message to the webview. Public so toolbar button commands can send messages. */
  public postMessage(message: unknown): void {
      return postMessage(this, message);
  }

  public async appendReviewComments(comments: unknown[], autoSend = false): Promise<void> {
    this.pendingReviewComments.push({ comments, autoSend })

    if (!this.webview) {
      await vscode.commands.executeCommand(`${StrataProvider.viewType}.focus`)
    }

    this.flushPendingReviewComments()
  }

  flushPendingReviewComments(): void {
    if (!this.webview || !this.isWebviewReady || this.pendingReviewComments.length === 0) return

    const pending = this.pendingReviewComments
    this.pendingReviewComments = []

    for (const entry of pending) {
      this.postMessage({ type: "appendReviewComments", comments: entry.comments, autoSend: entry.autoSend })
    }
  }

  /**
   * Get the git remote URL for the current workspace using VS Code's built-in Git API.
   * Returns undefined if not in a git repo or no remotes are configured.
   */
  async getGitRemoteUrl(): Promise<string | undefined> {
    try {
      const extension = vscode.extensions.getExtension("vscode.git")
      if (!extension) return undefined
      const api = extension.isActive ? extension.exports?.getAPI(1) : (await extension.activate())?.getAPI(1)
      if (!api) return undefined
      const repo = api.repositories?.[0]
      if (!repo) return undefined
      const remote = repo.state?.remotes?.find((r: { name: string }) => r.name === "origin")
      return remote?.fetchUrl ?? remote?.pushUrl
    } catch (error) {
      Logger.warn("StrataProvider", "Failed to get git remote URL:", error)
      return undefined
    }
  }

  /**
   * Gather VS Code editor context to send alongside messages to the CLI backend.
   */
  /**
   * Return the set of relative paths for all open text-editor tabs within the
   * given directory, filtered through .stratacodeignore.
   */
  async getOpenTabPaths(dir: string): Promise<Set<string>> {
      return getOpenTabPaths(this, dir);
  }

  /**
   * Get or create a FileIgnoreController for the current workspace directory.
   * Reinitializes if the workspace directory has changed.
   */
  async getIgnoreController(workspaceDir: string): Promise<FileIgnoreController> {
    if (this.ignoreController && this.ignoreControllerDir === workspaceDir) {
      return this.ignoreController
    }
    const controller = new FileIgnoreController(workspaceDir)
    await controller.initialize()
    this.ignoreController = controller
    this.ignoreControllerDir = workspaceDir
    return controller
  }

  async gatherRepoContext(
    visibleFiles: string[],
  ): Promise<{ repoMap?: string; projectMemory?: { id: string; title: string; content: string }[] }> {
      return gatherRepoContext(this, visibleFiles);
  }

  async gatherEditorContext(): Promise<EditorContext> {
      return gatherEditorContext(this);
  }

  /**
   * Get the workspace directory for a session.
   * Checks session directory overrides first (e.g., worktree paths), then falls back to workspace root.
   */
  getWorkspaceDirectory(sessionId?: string): string {
    return resolveWorkspaceDirectory({
      sessionID: sessionId,
      sessionDirectories: this.sessionDirectories,
      workspaceDirectory: this.getRootDirectory(),
    })
  }

  public get currentConfig(): any {
    return (this.cachedConfigMessage as { config?: any } | null)?.config
  }

  /** Public accessor for plugin API — resolves workspace directory for a session. */
  public getWorkspaceDirectoryPublic(sessionId?: string): string {
    return this.getWorkspaceDirectory(sessionId)
  }

  getContextDirectory(): string {
    return resolveContextDirectory({
      currentSessionID: this.currentSession?.id,
      contextSessionID: this.contextSessionID,
      sessionDirectories: this.sessionDirectories,
      workspaceDirectory: this.getRootDirectory(),
    })
  }

  getRootDirectory(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0]!.uri.fsPath
    }
    return process.cwd()
  }

  trackDirectory(sessionId: string, dir: string) {
    if (path.resolve(dir) === path.resolve(this.getRootDirectory())) {
      this.sessionDirectories.delete(sessionId)
      return
    }
    this.sessionDirectories.set(sessionId, dir)
  }

  noteFollowup(answers: string[][], sessionID?: string) {
    const dir = this.getWorkspaceDirectory(sessionID)
    this.pendingFollowup = recordFollowup({ answers, dir, now: Date.now() }) ?? null
  }

  matchesPendingFollowup(session: Session) {
    return matchFollowup({ pending: this.pendingFollowup, dir: session.directory, now: Date.now() })
  }

  adoptPendingFollowup(session: Session) {
      return adoptPendingFollowup(this, session);
  }

  getProjectDirectory(sessionId?: string): string | undefined {
    return resolveProjectDirectory(this.projectDirectory, () => this.getWorkspaceDirectory(sessionId))
  }

  _getHtmlForWebview(webview: vscode.Webview): string {
    return buildWebviewHtml(webview, {
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")),
      iconsBaseUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "assets", "icons")),
      title: "Strata Code",
      port: this.connectionService.getServerInfo()?.port,
      extraStyles: `.container { height: 100%; display: flex; flex-direction: column; height: 100vh; border-right: 1px solid var(--border-weak-base); }`,
    })
  }

  // legacy-migration start -------------------------------------------------------
  // Migration handlers extracted to strata-provider/handlers/migration.ts

  get migrationCtx(): MigrationContext {
    const self = this
    return {
      client: this.client,
      extensionContext: this.extensionContext,
      postMessage: (msg) => this.postMessage(msg),
      get cachedLegacyData() {
        return self.cachedLegacyData
      },
      set cachedLegacyData(data) {
        self.cachedLegacyData = data
      },
      get migrationCheckInFlight() {
        return self.migrationCheckInFlight
      },
      set migrationCheckInFlight(val) {
        self.migrationCheckInFlight = val
      },
      refreshSessions: () => this.refreshSessions(),
      disposeGlobal: () => this.disposeGlobal(),
      broadcastComplete: () => this.connectionService.notifyMigrationComplete(),
    }
  }

  // legacy-migration end ---------------------------------------------------------

  getMarketplace(): MarketplaceService {
    if (this.marketplace) return this.marketplace
    this.marketplace = new MarketplaceService()
    return this.marketplace
  }

  // ── Worktree stats polling (sidebar diff badge) ──────────────────

  startStatsPolling(): void {
      return startStatsPolling(this);
  }

  /**
   * Dispose of the provider and clean up subscriptions.
   * Does NOT kill the server — that's the connection service's job.
   */

  public applyMarkdownTasks() {
    this.planningService?.applyMarkdownTasks()
  }

  public openPlanFile(file?: string, line?: number) {
    this.planningService?.openPlanFile(file, line)
  }

  disposeSubscriptions(): void {
    this.unsubscribeRemote?.()
    this.unsubscribeEvent?.()
    this.unsubscribeState?.()
    this.unsubscribeNotificationDismiss?.()
    this.unsubscribeLanguageChange?.()
    this.unsubscribeProfileChange?.()
    this.unsubscribeFavoritesChange?.()
    this.unsubscribeMigrationComplete?.()
    this.unsubscribeClearPendingPrompts?.()
    this.unsubscribeDirectoryProvider?.()
  }

  disposeDisposables(): void {
    this.viewStateDisposable?.dispose()
    this.visibilityDisposable?.dispose()
    this.webviewMessageDisposable?.dispose()
    this.autocompleteConfigDisposable?.dispose()
    this.settingsConfigDisposable?.dispose()
    this.pluginFeaturesDisposable?.dispose()
    this.pluginConfigSectionsDisposable?.dispose()
    this.pluginConfigDisposable?.dispose()
    this.pluginContributionsDisposable?.dispose()
    this._onDidRegisterSession.dispose()
  }

  disposeState(): void {
      return disposeState(this);
  }

  disposeServices(): void {
    this.statsPoller?.stop()
    this.statsGitOps?.dispose()
    this.ignoreController?.dispose()
    this.chatAutocomplete?.dispose()
    this.gitWatcher?.dispose()
    this.planningService?.dispose()
    this.workerStatusBar?.dispose()
    this.workerWatcher?.dispose()
    ;(this.marketplace?.dispose(), disposeGitChangesTarget())
  }

  dispose(): void {
    this.focusSession()
    this.disposeSubscriptions()
    this.disposeDisposables()
    this.disposeState()
    this.disposeServices()
  }
}
