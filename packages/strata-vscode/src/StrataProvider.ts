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

type MessageLoadMode = "replace" | "prepend" | "focus" | "reconcile"

// Helper to map agent data to the subset of fields sent to the webview
const mapAgent = (a: Agent) => ({
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
import { isEnabled } from "./stratacode/feature-gate" // stratacode_change

export class StrataProvider implements vscode.WebviewViewProvider, TelemetryPropertiesProvider {
  public static readonly viewType = "strata-code.SidebarProvider"
  private static workerBarCreated = false
  private readonly instanceId = crypto.randomUUID()
  private gitWatcher?: GitWatcher
  public workerStatusBar?: WorkerStatusBar
  private workerWatcher?: WorkerWatcher

  private webview: vscode.Webview | null = null
  private currentSession: Session | null = null
  /** Remembers the last selected session so /new can stay in the same worktree after clearSession. */
  private contextSessionID: string | undefined
  /** Session used for instant AI comment threads in the Agent Manager diff viewer. */
  private diffExplainSession: string | undefined
  private connectionState: "connecting" | "connected" | "disconnected" | "error" = "connecting"
  private loginAttempt = 0

  private autoApproveTimer: AutoApproveTimer = new AutoApproveTimer(this)
  private planningService: PlanningService | null = null

  private isWebviewReady = false
  private readonly extensionVersion =
    vscode.extensions.getExtension("stratacode.strata-code")?.packageJSON?.version ?? "unknown"
  /** Cached providersLoaded payload so requestProviders can be served before client is ready */
  private cachedProvidersMessage: unknown = null
  /** Coalesce provider refreshes — at most one follow-up rerun when a request lands mid-flight. */
  private providersRefresh: Promise<void> | null = null
  private providersQueued = false
  private providersGeneration = 0
  /** Cached agentsLoaded payload so requestAgents can be served before client is ready */
  private cachedAgentsMessage: unknown = null
  /** Cached skillsLoaded payload so requestSkills can be served before client is ready */
  private cachedSkillsMessage: unknown = null
  /** Cached commandsLoaded payload so requestCommands can be served before client is ready */
  private cachedCommandsMessage: unknown = null
  /** Cached configLoaded payload so requestConfig can be served before client is ready */
  private cachedConfigMessage: unknown = null
  /** Cached indexingStatusLoaded payload so requestIndexingStatus can be served before client is ready */
  private cachedIndexingStatusMessage: unknown = null
  /** Cached mcpStatusLoaded payload so requestMcpStatus can be served before client is ready */
  private cachedMcpStatusMessage: unknown = null
  /** Ref-count of in-flight handleUpdateConfig calls; prevents fetchAndSendConfig from sending stale data */
  private pending = 0
  private configWarningsShown = false
  /** Cached notificationsLoaded payload */
  private cachedNotificationsMessage: unknown = null
  private pendingReviewComments: { comments: unknown[]; autoSend: boolean }[] = []
  private readyResolvers: (() => void)[] = []
  private promptRecoveryQueued = false
  private promptRecovery: Promise<void> | null = null
  private trackedSessionIds: Set<string> = new Set()
  private syncedChildSessions: Set<string> = new Set()
  /** Tracks the latest status for each session, used to warn before destructive config operations. */
  private sessionStatusMap = new Map<string, SessionStatus["type"]>()
  /** Tracks sessions waiting for a message to complete */

  // Subscriptions directory overrides (e.g., worktree paths registered by AgentManagerProvider). */
  private sessionDirectories = new Map<string, string>()
  /** Project ID for the current workspace, used to filter out sessions from other repositories. */
  private projectID: string | undefined
  /** Abort controller for the current loadMessages request; aborted when a new session is selected. */
  private loadMessagesAbort: AbortController | null = null
  /** Per-session last focus-mode reconcile timestamp — throttles rapid tab switching. */
  private lastReconciledAt = new Map<string, number>()
  /** Set when refreshSessions() is called before the client is ready.
   *  Cleared and retried once the connection transitions to "connected". */
  private pendingSessionRefresh = false
  private readonly streams = new SessionStreamScheduler((msg) => this.postMessage(msg))
  private readonly confirmations = new MessageConfirmation()
  private unsubscribeEvent: (() => void) | null = null
  private unsubscribeState: (() => void) | null = null
  /** Cached legacy migration data so migrate() doesn't re-read from disk/SecretStorage. */ // legacy-migration
  private cachedLegacyData: import("./legacy-migration/legacy-types").LegacyMigrationData | null = null // legacy-migration
  /** Guard to prevent checkAndShowMigrationWizard running concurrently. */ // legacy-migration
  private migrationCheckInFlight = false // legacy-migration
  private unsubscribeNotificationDismiss: (() => void) | null = null
  private unsubscribeLanguageChange: (() => void) | null = null
  private unsubscribeProfileChange: (() => void) | null = null
  private unsubscribeFavoritesChange: (() => void) | null = null
  private unsubscribeMigrationComplete: (() => void) | null = null // legacy-migration
  private unsubscribeClearPendingPrompts: (() => void) | null = null
  private unsubscribeDirectoryProvider: (() => void) | null = null
  private initConnectionPromise: Promise<void> | null = null
  private webviewMessageDisposable: vscode.Disposable | null = null
  private autocompleteConfigDisposable: vscode.Disposable | null = null
  private settingsConfigDisposable: vscode.Disposable | null = null
  private pluginFeaturesDisposable: vscode.Disposable | null = null
  private pluginConfigSectionsDisposable: vscode.Disposable | null = null
  private pluginConfigDisposable: vscode.Disposable | null = null
  private pluginContributionsDisposable: vscode.Disposable | null = null
  private viewStateDisposable: vscode.Disposable | null = null
  private visibilityDisposable: vscode.Disposable | null = null
  /** Whether the sidebar panel is currently visible to the user. */
  private sidebarVisible = false /** Reference to the WebviewView for badge updates. */
  private view: vscode.WebviewView | null =
    null /** Number of pending prompts (permissions + questions) — drives the Activity Bar badge. */
  private pendingPrompts = 0
  /** Lazily initialized ignore controller for .stratacodeignore filtering */
  private ignoreController: FileIgnoreController | null = null
  private ignoreControllerDir: string | null = null
  private marketplace: MarketplaceService | null = null
  private chatAutocomplete: ChatTextAreaAutocomplete | null = null
  private projectDirectory: string | null | undefined
  private slimEditMetadata = true

  private pendingFollowup: Followup | null = null
  private followupListeners: Array<(session: Session, directory: string) => void> = []
  /** Worktree diff stats poller for the sidebar badge — reuses GitStatsPoller (local stats only) */
  private statsPoller: GitStatsPoller | null = null
  private statsGitOps: GitOps | null = null
  private cachedStats: unknown = null
  private cachedGitRepo = false

  /** Optional interceptor called before the standard message handler.
   *  Return null to consume the message, or return a (possibly transformed) message. */
  private onBeforeMessage: ((msg: Record<string, unknown>) => Promise<Record<string, unknown> | null>) | null = null

  /** Handler for "Continue in Worktree" — set by extension.ts to delegate to AgentManagerProvider. */
  private continueInWorktreeHandler:
    | ((sessionId: string, progress: (status: string, detail?: string, error?: string) => void) => Promise<void>)
    | null = null

  /** Handler for sidebar worktree creation — delegates to AgentManagerProvider. */
  private createWorktreeHandler: ((baseBranch?: string, branchName?: string) => Promise<void>) | null = null

  private diffVirtualProvider: import("./DiffVirtualProvider").DiffVirtualProvider | undefined
  private remoteService: RemoteStatusService | null = null
  private unsubscribeRemote: (() => void) | null = null

  private readonly _onDidRegisterSession = new vscode.EventEmitter<Session>()
  public readonly onDidRegisterSession = this._onDidRegisterSession.event

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionService: StrataConnectionService,
    private readonly extensionContext?: vscode.ExtensionContext,
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
  private sendRemoteStatus(): void {
    const s = this.remoteService?.getState()
    if (s) this.postMessage({ type: "remoteStatus", enabled: s.enabled, connected: s.connected })
  }
  private focusSession(id?: string): void {
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
  private slimPart<T>(part: T): T {
    if (!this.slimEditMetadata) return part
    return slimPart(part)
  }

  private slimParts<T>(parts: T[]) {
    if (!this.slimEditMetadata) return parts
    return slimParts(parts)
  }

  private get forkCtx() {
    return {
      connection: this.connectionService,
      post: (msg: { type: "error"; message: string }) => this.postMessage(msg),
      register: (session: Session) => this.registerSession(session),
      forked: (session: Session) => this.postMessage({ type: "sessionForked", sessionID: session.id }),
      status: (sessionID: string) => this.sessionStatusMap.get(sessionID),
      directory: (sessionID: string) => this.getWorkspaceDirectory(sessionID),
    }
  }

  private async syncWebviewState(reason: string): Promise<void> {
    const serverInfo = this.connectionService.getServerInfo()
    Logger.info("StrataProvider", "🔄 syncWebviewState()", {
      reason,
      isWebviewReady: this.isWebviewReady,
      connectionState: this.connectionState,
      hasClient: !!this.client,
      hasServerInfo: !!serverInfo,
    })

    if (!this.isWebviewReady) {
      Logger.info("StrataProvider", "⏭️ syncWebviewState skipped (webview not ready)")
      return
    }

    // Always push connection state first so the UI can render appropriately.
    this.postMessage({
      type: "connectionState",
      state: this.connectionState,
    })

    // Re-send ready so the webview can recover after refresh.
    if (serverInfo) {
      const langConfig = vscode.workspace.getConfiguration("strata-code.new")
      this.postMessage({
        type: "ready",
        serverInfo,
        extensionVersion: this.extensionVersion,
        vscodeLanguage: vscode.env.language,
        languageOverride: langConfig.get<string>("language"),
        workspaceDirectory: this.getProjectDirectory(this.currentSession?.id),
      })
    }

    // Push plugin UI contributions
    this.postMessage({
      type: "pluginContributionsLoaded",
      contributions: pluginRegistry.getRenderableContributions(),
    })

    // Push plugin config sections
    this.postMessage(buildPluginConfigLoaded())

    // Push plugin features
    this.postMessage({
      type: "pluginFeaturesLoaded",
      features: pluginRegistry.getRenderablePluginFeatures(),
    })

    // Always attempt to fetch+push profile when connected.
    // Profile returns 401 when user isn't logged into Strata Gateway — that's expected.
    // Use fire-and-forget (no throwOnError) to match old getProfile() which returned null on error.
    if (this.connectionState === "connected" && this.client) {
      if (isEnabled("strataAuth")) {
        Logger.info("StrataProvider", "👤 syncWebviewState fetching profile...")
        const profileResult = await retry(() => this.client!.strata.profile())
        const profileData = profileResult.data ?? null
        Logger.info("StrataProvider", "👤 syncWebviewState profile:", profileData ? "received" : "null")
        this.postMessage({
          type: "profileData",
          data: profileData,
        })
      }

      // Re-send cached worktree stats and git status after webview reload.
      if (this.cachedStats) this.postMessage(this.cachedStats)
      this.postMessage({ type: "gitStatus", repo: this.cachedGitRepo })

      // Seed session status map so the Settings panel knows about already-running sessions.
      // Must run after webview is ready (postMessage is a no-op before that).
      // Only reconcile (reset missing busy→idle) when the map is empty, i.e.
      // on the very first seed before any real-time SSE events have arrived.
      // On SSE reconnects or webview recreations the live SSE data is
      // authoritative and reconciliation risks race-resetting busy sessions.
      const reconcile = this.sessionStatusMap.size === 0
      void this.seedSessionStatusMap(reconcile)

      this.sendRemoteStatus()
    }

    // legacy-migration start
    // Show the migration wizard once the CLI connection is established.
    // Three triggers cover all timing scenarios:
    //   "webviewReady" + connected — webview loaded after SSE was already up
    //   "sse-connected"            — SSE connected after webview was ready
    //   "initializeConnection"     — sidebar path where connect() resolves before
    //                                onStateChange is subscribed, so sse-connected never fires
    if (this.connectionState === "connected") {
      void checkAndShowMigrationWizard(this.migrationCtx)
    }
    // legacy-migration end
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

  private async flushPendingPrompts(): Promise<void> {
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

  private setupWebviewMessageHandler(webview: vscode.Webview): void {
    this.webviewMessageDisposable?.dispose()
    this.autocompleteConfigDisposable?.dispose()
    this.settingsConfigDisposable?.dispose()
    this.pluginFeaturesDisposable?.dispose()
    this.pluginConfigSectionsDisposable?.dispose()
    this.pluginConfigDisposable?.dispose()
    this.pluginContributionsDisposable?.dispose()

    this.pluginFeaturesDisposable = pluginRegistry.onDidChangeFeatures((features) => {
      this.postMessage({ type: "pluginFeaturesLoaded", features })
    })
    this.pluginConfigSectionsDisposable = pluginRegistry.onDidChangeConfigSections(() => {
      this.postMessage(buildPluginConfigLoaded())
    })
    this.pluginConfigDisposable = pluginRegistry.onDidChangePluginConfig(({ sectionId, key, value }) => {
      this.postMessage({
        type: "pluginConfigUpdated",
        sectionId,
        values: { [key]: value },
      })
    })
    this.pluginContributionsDisposable = pluginRegistry.onDidChangeContributions((contributions) => {
      this.postMessage({ type: "pluginContributionsLoaded", contributions })
    })

    this.autocompleteConfigDisposable = AutocompleteSettingsManager.getInstance().watchAutocompleteConfig((msg) =>
      this.postMessage(msg),
    )
    this.settingsConfigDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("strata-code.new.agents")) {
        this.fetchAndSendAgents()
      }

      if (e.affectsConfiguration("strata-code.new.features")) {
        this.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
      }

      const affectsWorkers =
        e.affectsConfiguration("strata-code.new.features.workers") ||
        e.affectsConfiguration("strata-code.new.features.explainerWorker") ||
        e.affectsConfiguration("strata-code.new.features.reviewerWorker") ||
        e.affectsConfiguration("strata-code.new.workers.autoExplain") ||
        e.affectsConfiguration("strata-code.new.workers.pollingIntervalSec") ||
        e.affectsConfiguration("strata-code.new.workers.summarizerPrompt") ||
        e.affectsConfiguration("strata-code.new.workers.reviewPrompt") ||
        e.affectsConfiguration("strata-code.new.workers.explainerPrompt")

      if (affectsWorkers) {
        if (e.affectsConfiguration("strata-code.new.features.workers")) {
          this.workerStatusBar?.onConfigChanged()
          this.fetchAndSendAgents()
        }

        const config = vscode.workspace.getConfiguration("strata-code.new")
        const enabled = isEnabled("workers")
        const review = isEnabled("reviewerWorker")
        const auto_explain = isEnabled("explainerWorker") || config.get<boolean>("workers.autoExplain", false)
        const polling_interval_sec = config.get<number>("workers.pollingIntervalSec", 5)
        const summarizer_prompt = config.get<string>("workers.summarizerPrompt", "")
        const review_prompt = config.get<string>("workers.reviewPrompt", "")
        const explainer_prompt = config.get<string>("workers.explainerPrompt", "")

        if (this.client) {
          try {
            await this.client.global.config.update({
              config: {
                workers: {
                  enabled,
                  review,
                  auto_explain,
                  polling_interval_sec,
                  summarizer_prompt,
                  review_prompt,
                  explainer_prompt,
                },
              },
            })
          } catch (err) {
            Logger.error("StrataProvider", "Failed to sync workers config to backend", err)
          }
        }
      }
    })
    // eslint-disable-next-line complexity
    this.webviewMessageDisposable = webview.onDidReceiveMessage(async (message) => {
      if (message.type === "requestSetting") {
        Logger.info("StrataProvider", `[DEBUG] requestSetting arrived at onDidReceiveMessage: key=${message.key}`)
      }
      const intercepted = await interceptMessage(message, {
        workspaceDir: (sid) => this.getWorkspaceDirectory(sid ?? this.currentSession?.id),
        post: (m) => this.postMessage(m),
        error: getErrorMessage,
        before: this.onBeforeMessage,
      })
      if (intercepted === null) {
        if (message.type === "requestSetting") {
          Logger.warn(
            "StrataProvider",
            `[DEBUG] requestSetting CONSUMED by interceptMessage (returned null): key=${message.key}`,
          )
        }
        return
      }
      message = intercepted

      await routeSuggestionWebviewMessage(this.questionCtx, message)
      if (await ModelState.handleMessage(message.type, message, this.client, (msg) => this.postMessage(msg))) return
      if (
        await AutocompleteSettingsManager.getInstance().routeAutocompleteMessage(message, (msg) =>
          this.postMessage(msg),
        )
      )
        return
      if (
        await handleSidebarWorktreeMessage(message, {
          post: (msg) => this.postMessage(msg),
          openAgentManager: () => vscode.commands.executeCommand("strata-code.new.agentManagerOpen"),
          openAdvancedWorktree: () => vscode.commands.executeCommand("strata-code.new.agentManager.advancedWorktree"),
          openChanges: (sessionId?: string) => vscode.commands.executeCommand("strata-code.new.showChanges", sessionId),
          createWorktree: async (baseBranch, branchName) => {
            await this.createWorktreeHandler?.(baseBranch, branchName)
          },
          continueInWorktree: this.continueInWorktreeHandler ?? undefined,
        })
      ) {
        return
      }
      switch (message.type) {
        case "webviewReady":
          Logger.info("StrataProvider", "✅ webviewReady received")
          this.isWebviewReady = true
          this.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
          await this.syncWebviewState("webviewReady")
          this.flushPendingReviewComments()
          this.recoverPendingPrompts()
          this.readyResolvers.splice(0).forEach((r) => r())
          break

        case "cancelAutoApproveTimer":
          if (this.autoApproveTimer.isTimerRunningFor(message.requestId)) {
            this.autoApproveTimer.clearTimer()
          }
          break

        case "executePluginContribution":
          pluginRegistry.executeContribution((message as any).id)
          break
        case "sendMessage": {
          const files = parseMessageFiles(message.files)
          await this.handleSendMessage(
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
          break
        }
        case "sendCommand": {
          const files = parseMessageFiles(message.files)
          await this.handleSendCommand(
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
          break
        }
        case "abort":
          this.cancelRetry(message.sessionID ?? "")
          await this.handleAbort(message.sessionID)
          break
        case "revertSession":
          this.handleRevertSession(message.sessionID, message.messageID).catch((e) =>
            Logger.error("StrataProvider", "handleRevertSession failed:", e),
          )
          break
        case "unrevertSession":
          this.handleUnrevertSession(message.sessionID).catch((e) =>
            Logger.error("StrataProvider", "handleUnrevertSession failed:", e),
          )
          break
        case "permissionResponse":
          await handlePermissionResponse(
            this.permissionCtx,
            message.permissionId,
            message.sessionID,
            message.response,
            message.approvedAlways,
            message.deniedAlways,
            message.scope,
            message.agent,
          )
          break
        case "createSession":
          await this.handleCreateSession()
          break
        case "clearSession":
          this.contextSessionID = this.currentSession?.id ?? this.contextSessionID
          this.currentSession = null
          this.focusSession()
          break
        case "loadMessages":
          // Don't await: allow parallel loads so rapid session switching
          // isn't blocked by slow responses for earlier sessions.
          void this.handleLoadMessages(message.sessionID, {
            mode: message.mode,
            before: message.before,
            limit: message.limit,
          })
          break
        case "requestPlanningSettings":
          this.postMessage({
            type: "planningSettingsLoaded",
            settings: {
              taskView: vscode.workspace.getConfiguration("strata-code.new.planning").get("taskView") ?? true,
              documentDrivenTasks:
                vscode.workspace.getConfiguration("strata-code.new.planning").get("documentDrivenTasks") ?? true,
            },
          })
          break
        case "updatePlanningSetting":
          await vscode.workspace
            .getConfiguration("strata-code.new.planning")
            .update(message.key, message.value, vscode.ConfigurationTarget.Global)
          this.postMessage({
            type: "planningSettingsLoaded",
            settings: {
              taskView: vscode.workspace.getConfiguration("strata-code.new.planning").get("taskView") ?? true,
              documentDrivenTasks:
                vscode.workspace.getConfiguration("strata-code.new.planning").get("documentDrivenTasks") ?? true,
            },
          })
          break
        case "planning.requestState":
          this.planningService?.pushState()
          this.planningService?.pushKanbanTasks()
          break
        case "planning.add":
          this.planningService?.add(message as any)
          break
        case "planning.update":
          this.planningService?.update(message.taskId, message.updates)
          break
        case "planning.remove":
          this.planningService?.remove(message.taskId)
          break
        case "planning.dispatch":
          this.planningService?.dispatch(message.taskId)
          break
        case "planning.confirm":
          this.planningService?.confirm(message.taskId)
          break
        case "planning.applyMarkdown":
          this.planningService?.applyMarkdownTasks()
          break
        case "planning.requestMarkdownPreview":
          this.planningService?.pushMarkdownPreview()
          break
        case "planning.openPlanFile":
          this.planningService?.openPlanFile(message.file, message.line)
          break
        case "syncSession":
          this.handleSyncSession(message.sessionID, message.parentSessionID).catch((e) =>
            Logger.error("StrataProvider", "handleSyncSession failed:", e),
          )
          break
        case "loadSessions":
          this.handleLoadSessions().catch((e) => Logger.error("StrataProvider", "handleLoadSessions failed:", e))
          break
        case "login": {
          if (!isEnabled("strataAuth")) break
          const attempt = ++this.loginAttempt
          await handleLogin(this.authCtx, attempt, () => this.loginAttempt)
          break
        }
        case "cancelLogin":
          if (!isEnabled("strataAuth")) break
          this.loginAttempt++
          this.postMessage({ type: "deviceAuthCancelled" })
          break
        case "logout":
          if (!isEnabled("strataAuth")) break
          await handleLogout(this.authCtx)
          break
        case "setOrganization":
          if (!isEnabled("strataAuth")) break
          if (typeof message.organizationId === "string" || message.organizationId === null) {
            await handleSetOrganization(this.authCtx, message.organizationId)
          }
          break
        case "refreshProfile":
          if (!isEnabled("strataAuth")) break
          await handleRefreshProfile(this.authCtx)
          break
        case "openExternal":
          this.openExternal(message.url)
          break
        case "openSettingsPanel":
          vscode.commands.executeCommand("strata-code.new.settingsButtonClicked", message.tab)
          break
        case "openVSCodeSettings":
          vscode.commands.executeCommand("workbench.action.openSettings", message.query)
          break
        case "openConfigFile":
          await openConfig(message.scope, message.labels, this.getProjectDirectory(this.currentSession?.id))
          break
        case "openMarketplacePanel":
          vscode.commands.executeCommand("strata-code.new.marketplaceButtonClicked", this.projectDirectory)
          break
        case "openDiffVirtual":
          this.openDiffVirtual(message.diff, message.initialDiffStyle)
          break
        case "forkSession":
          handleForkSession(this.forkCtx, message.sessionId, message.messageId).catch((e) =>
            Logger.error("StrataProvider", "handleForkSession failed:", e),
          )
          break

        case "retryConnection":
          Logger.info("StrataProvider", "🔄 Retrying connection...")
          this.initializeConnection().catch((e) => Logger.error("StrataProvider", "❌ Retry connection failed:", e))
          break
        case "openSubAgentViewer":
          vscode.commands.executeCommand("strata-code.new.openSubAgentViewer", message.sessionID, message.title)
          break
        case "previewImage":
          this.handlePreviewImage(message.dataUrl, message.filename)
          break
        case "openFile":
          if (message.filePath) {
            this.handleOpenFile(message.filePath, message.line, message.column)
          }
          break
        case "requestProviders":
          this.fetchAndSendProviders().catch((e) => Logger.error("StrataProvider", "fetchAndSendProviders failed:", e))
          try {
            sendAcpProviderMeta((msg) => this.postMessage(msg), this.cachedConfigMessage)
          } catch (e) {
            Logger.error("StrataProvider", "sendAcpProviderMeta failed:", e)
          }
          break
        case "testAcpConnection":
          testAcpConnection(
            message.key,
            (msg) => this.postMessage(msg),
            this.cachedConfigMessage,
            this.getWorkspaceDirectory()
          ).catch((e: unknown) => Logger.error("StrataProvider", "testAcpConnection failed:", e))
          break
        case "connectProvider":
        case "authorizeProviderOAuth":
        case "completeProviderOAuth":
        case "disconnectProvider":
        case "saveCustomProvider":
          await this.handleProviderAction(message)
          break
        case "fetchCustomProviderModels":
          this.handleFetchCustomProviderModels(message).catch((e) =>
            Logger.error("StrataProvider", "fetchCustomProviderModels failed:", e),
          )
          break
        case "compact":
          await this.handleCompact(message.sessionID, message.providerID, message.modelID)
          break
        case "requestAgents":
          this.fetchAndSendAgents().catch((e) => Logger.error("StrataProvider", "fetchAndSendAgents failed:", e))
          break
        case "requestSkills":
          this.fetchAndSendSkills().catch((e) => Logger.error("StrataProvider", "fetchAndSendSkills failed:", e))
          break
        case "requestCommands":
          this.fetchAndSendCommands().catch((e) => Logger.error("StrataProvider", "fetchAndSendCommands failed:", e))
          break
        case "removeSkill":
          this.removeSkillViaCli(message.location).catch((e: unknown) =>
            Logger.error("StrataProvider", "removeSkill failed:", e),
          )
          break
        case "removeMode":
          this.handleRemoveMode(message.name).catch((e) =>
            Logger.error("StrataProvider", "handleRemoveMode failed:", e),
          )
          break
        case "removeMcp":
          this.handleRemoveMcp(message.name).catch((e) => Logger.error("StrataProvider", "handleRemoveMcp failed:", e))
          break
        case "requestMcpStatus":
          this.fetchAndSendMcpStatus().catch((e) => Logger.error("StrataProvider", "fetchAndSendMcpStatus failed:", e))
          break
        case "connectMcp":
          this.handleConnectMcp(message.name).catch((e) =>
            Logger.error("StrataProvider", "handleConnectMcp failed:", e),
          )
          break
        case "disconnectMcp":
          this.handleDisconnectMcp(message.name).catch((e) =>
            Logger.error("StrataProvider", "handleDisconnectMcp failed:", e),
          )
          break

        case "questionReply":
          this.noteFollowup(message.answers, message.sessionID)
          if (!(await handleQuestionReply(this.questionCtx, message.requestID, message.answers, message.sessionID))) {
            this.pendingFollowup = null
          }
          break
        case "questionReject":
          this.pendingFollowup = null
          await handleQuestionReject(this.questionCtx, message.requestID, message.sessionID)
          break
        case "requestConfig":
          this.fetchAndSendConfig().catch((e) => Logger.error("StrataProvider", "fetchAndSendConfig failed:", e))
          break
        case "requestGlobalConfig":
          this.fetchAndSendGlobalConfig().catch((e) =>
            Logger.error("StrataProvider", "fetchAndSendGlobalConfig failed:", e),
          )
          break
        case "requestIndexingStatus":
          this.fetchAndSendIndexingStatus().catch((e) =>
            Logger.error("StrataProvider", "fetchAndSendIndexingStatus failed:", e),
          )
          break
        case "updateConfig":
          await this.handleUpdateConfig(message.config)
          break
        case "openSettingsTab":
          if (message.tab === "indexing") {
            await vscode.commands.executeCommand("strata-code.new.openIndexingSettings")
          } else if (message.tab && message.tab.startsWith("plugin:")) {
            // Routing for plugin config tabs
            await vscode.commands.executeCommand("strata-code.new.openSettings", message.tab)
          }
          break
        case "requestPluginConfig": {
          this.postMessage(buildPluginConfigLoaded())
          break
        }
        case "savePluginConfig": {
          await handleSavePluginConfig(message.sectionId, message.changes, (msg) => this.postMessage(msg))
          break
        }
        case "togglePluginFeature": {
          const cfg = vscode.workspace.getConfiguration(message.featureId)
          await cfg.update("enabled", message.enabled, vscode.ConfigurationTarget.Global)
          break
        }
        case "setLanguage":
          await vscode.workspace
            .getConfiguration("strata-code.new")
            .update("language", message.locale || undefined, vscode.ConfigurationTarget.Global)
          this.connectionService.notifyLanguageChanged(message.locale as string)
          break
        case "requestChatCompletion": {
          if (!this.chatAutocomplete) {
            this.chatAutocomplete = new ChatTextAreaAutocomplete(this.connectionService)
          }
          void this.chatAutocomplete.handle(
            { type: "requestChatCompletion", text: message.text, requestId: message.requestId },
            {
              postMessage: (msg: { type: "chatCompletionResult"; text: string; requestId: string }) =>
                this.postMessage(msg),
            },
          )
          break
        }
        case "requestFileSearch":
          await handleFileSearch({
            client: this.client,
            message,
            current: this.currentSession?.id,
            context: this.contextSessionID,
            dir: (id) => this.getWorkspaceDirectory(id),
            open: (dir) => this.getOpenTabPaths(dir),
            post: (msg) => this.postMessage(msg),
          })
          break
        case "requestTerminalContext":
          void this.handleTerminalContext(message.requestId)
          break
        case "chatCompletionAccepted":
          this.chatAutocomplete?.telemetry.captureAcceptSuggestion(message.suggestionLength)
          break
        case "toggleRemote":
        case "setRemoteEnabled":
        case "requestRemoteStatus":
          this.remoteService
            ?.handleMessage(message.type, message.enabled)
            .then((s) => {
              if (s) this.sendRemoteStatus()
            })
            .catch((err) => Logger.error("StrataProvider", "remote message failed:", err))
          break
        case "deleteSession":
          await this.handleDeleteSession(message.sessionID)
          break
        case "renameSession":
          await this.handleRenameSession(message.sessionID, message.title)
          break
        case "updateSetting":
          await this.handleUpdateSetting(message.key, message.value)
          break
        case "webviewLog":
          if (message.level === "debug")
            Logger.debug(`Webview:${message.component}`, message.message, ...(message.data || []))
          else if (message.level === "info")
            Logger.info(`Webview:${message.component}`, message.message, ...(message.data || []))
          else if (message.level === "warn")
            Logger.warn(`Webview:${message.component}`, message.message, ...(message.data || []))
          else if (message.level === "error")
            Logger.error(`Webview:${message.component}`, message.message, ...(message.data || []))
          break
        case "requestBrowserSettings":
          this.sendBrowserSettings()
          break
        case "requestExtensionFeatures":
          this.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
          break
        case "requestClaudeCompatSetting":
          this.sendClaudeCompatSetting()
          break
        case "requestNotificationSettings":
          this.sendNotificationSettings()
          break
        case "requestSetting":
          this.handleRequestSetting(message.key)
          break
        case "diffViewer.startThread":
          Logger.info("StrataProvider", "diffViewer.startThread received", {
            threadId: message.threadId,
            file: message.file,
            line: message.line,
          })
          if (
            typeof message.threadId === "string" &&
            typeof message.file === "string" &&
            typeof message.line === "number" &&
            typeof message.text === "string"
          ) {
            void this.handleDiffStartThread(
              message.threadId,
              message.file,
              message.line,
              typeof message.endLine === "number" ? message.endLine : undefined,
              message.text,
              message.side as "left" | "right" | undefined,
            )
          }
          break
        case "diffViewer.explainAll":
          Logger.info("StrataProvider", "diffViewer.explainAll received")
          void this.handleDiffExplainAll(message)
          break
        case "diffViewer.replyToThread":
          if (typeof message.threadId === "string" && typeof message.text === "string") {
            void this.handleDiffReplyToThread(message.threadId, message.text)
          }
          break

        case "requestTimelineSetting":
          this.sendTimelineSetting()
          break
        case "requestNotifications":
          this.fetchAndSendNotifications().catch((e) =>
            Logger.error("StrataProvider", "fetchAndSendNotifications failed:", e),
          )
          break
        case "requestCloudSessions":
          if (!isEnabled("cloudSessions")) break
          await handleRequestCloudSessions(this.cloudSessionCtx, message)
          break
        case "requestGitRemoteUrl":
          void this.getGitRemoteUrl().then((url) => {
            this.postMessage({ type: "gitRemoteUrlLoaded", gitUrl: url ?? null })
          })
          break
        case "requestCloudSessionData":
          if (!isEnabled("cloudSessions")) break
          void handleRequestCloudSessionData(this.cloudSessionCtx, message.sessionId)
          break
        case "importAndSend": {
          if (!isEnabled("cloudSessions")) break
          const files = parseMessageFiles(message.files)
          void handleImportAndSend(
            this.cloudSessionCtx,
            message.cloudSessionId,
            message.text,
            typeof message.messageID === "string" ? message.messageID : undefined,
            message.providerID,
            message.modelID,
            message.agent,
            message.variant,
            files,
            typeof message.command === "string" ? message.command : undefined,
            typeof message.commandArgs === "string" ? message.commandArgs : undefined,
          )
          break
        }
        case "dismissNotification":
          await this.handleDismissNotification(message.notificationId)
          break
        case "resetAllSettings":
          await this.handleResetAllSettings()
          break
        case "telemetry":
          TelemetryProxy.capture(message.event, message.properties)
          break
        case "persistVariant": {
          const stored = this.extensionContext?.globalState.get<Record<string, string>>("variantSelections") ?? {}
          stored[message.key] = message.value
          await this.extensionContext?.globalState.update("variantSelections", stored)
          break
        }
        case "requestVariants": {
          const variants = this.extensionContext?.globalState.get<Record<string, string>>("variantSelections") ?? {}
          this.postMessage({ type: "variantsLoaded", variants })
          break
        }
        case "persistRecents":
          await this.extensionContext?.globalState.update("recentModels", validateRecents(message.recents))
          break
        case "requestRecents": {
          const recents = validateRecents(this.extensionContext?.globalState.get("recentModels"))
          this.postMessage({ type: "recentsLoaded", recents })
          break
        }
        case "toggleFavorite": {
          const current = validateFavorites(this.extensionContext?.globalState.get("favoriteModels"))
          const key = `${message.providerID}/${message.modelID}`
          const exists = current.some((f) => `${f.providerID}/${f.modelID}` === key)
          const favorites =
            message.action === "add" && !exists
              ? [...current, { providerID: message.providerID, modelID: message.modelID }]
              : message.action === "remove" && exists
                ? current.filter((f) => `${f.providerID}/${f.modelID}` !== key)
                : current
          await this.extensionContext?.globalState.update("favoriteModels", favorites)
          this.connectionService.notifyFavoritesChanged(favorites)
          break
        }
        case "requestFavorites": {
          const favorites = validateFavorites(this.extensionContext?.globalState.get("favoriteModels"))
          this.postMessage({ type: "favoritesLoaded", favorites })
          break
        }
        case "saveKanbanTasks":
          await this.extensionContext?.globalState.update("kanbanTasks", (message as any).tasks)
          break
        case "requestKanbanTasks": {
          const tasks = this.extensionContext?.globalState.get<any>("kanbanTasks") ?? []
          this.postMessage({ type: "kanbanTasksLoaded", tasks })
          break
        }
        case "requestRepoMapStats": {
          const sdkClient = this.connectionService.getClient()
          if (sdkClient) {
            sdkClient.repoMap
              .generate({ budget: 4096 })
              .then((res) => {
                if (res.data) {
                  this.postMessage({ type: "repoMapStatsLoaded", stats: res.data.stats })
                }
              })
              .catch((e) => {
                Logger.error("StrataProvider", "Failed to fetch repo map stats", e)
              })
          }
          break
        }
        case "invalidateRepoMap": {
          const sdkClient = this.connectionService.getClient()
          if (sdkClient) {
            sdkClient.repoMap
              .invalidate({})
              .then(() => {
                // Re-fetch stats after invalidation
                return sdkClient.repoMap.generate({ budget: 4096 })
              })
              .then((res) => {
                if (res && res.data) {
                  this.postMessage({ type: "repoMapStatsLoaded", stats: res.data.stats })
                }
              })
              .catch((e) => {
                Logger.error("StrataProvider", "Failed to invalidate repo map", e)
              })
          }
          break
        }

        // legacy-migration start
        case "requestLegacyMigrationData":
          void handleRequestLegacyMigrationData(this.migrationCtx)
          break
        case "startLegacyMigration":
          void handleStartLegacyMigration(this.migrationCtx, message.selections)
          break
        case "skipLegacyMigration":
          void handleSkipLegacyMigration(this.migrationCtx)
          break
        case "clearLegacyData":
          void handleClearLegacyData(this.migrationCtx)
          break
        case "finalizeLegacyMigration":
          void handleFinalizeLegacyMigration(this.migrationCtx)
          break
        // legacy-migration end
        case "enhancePrompt": {
          const sdkClient = this.client
          if (!sdkClient) {
            this.postMessage({
              type: "enhancePromptError",
              error: "Not connected to CLI backend",
              requestId: message.requestId,
            })
            break
          }
          void sdkClient.enhancePrompt
            .enhance({ text: message.text }, { throwOnError: true })
            .then(({ data }) => {
              this.postMessage({ type: "enhancePromptResult", text: data.text, requestId: message.requestId })
            })
            .catch((err: unknown) => {
              const msg = getErrorMessage(err) || "Failed to enhance prompt"
              Logger.error("StrataProvider", "Failed to enhance prompt:", err)
              vscode.window.showErrorMessage(`Enhance prompt failed: ${msg}`)
              this.postMessage({
                type: "enhancePromptError",
                error: msg,
                requestId: message.requestId,
              })
            })
          break
        }
        // stratacode_change start
        case "requestTaskSuggestions": {
          const sdkClient = this.client
          if (!sdkClient) break
          const dir = this.getProjectDirectory(this.currentSession?.id)
          void sdkClient.suggestTasks
            .generate({ body_directory: dir }, { throwOnError: true })
            .then(({ data }) => {
              this.postMessage({
                type: "taskSuggestionsResult",
                suggestions: data.suggestions,
                requestId: message.requestId,
                contextMapUpdated: Date.now(),
              })
            })
            .catch((err: unknown) => {
              Logger.error("StrataProvider", "suggestTasks failed:", err)
            })
          break
        }
        case "requestAgentChatCompletion": {
          const sdkClient = this.client
          if (!sdkClient) break
          const dir = this.getProjectDirectory(this.currentSession?.id)
          void sdkClient.chatAutocomplete
            .complete({ text: message.text, body_directory: dir }, { throwOnError: true })
            .then(({ data }) => {
              this.postMessage({ type: "agentChatCompletionResult", text: data.text, requestId: message.requestId })
            })
            .catch((err: unknown) => {
              Logger.error("StrataProvider", "chatAutocomplete failed:", err)
            })
          break
        }
        // stratacode_change end

        case "fetchMarketplaceData": {
          const workspace = this.getProjectDirectory(this.currentSession?.id)
          const mp = this.getMarketplace()
          // Fetch skills from CLI backend (authoritative source) so the
          // marketplace doesn't need to duplicate the CLI's skill scanning.
          const skills = await this.fetchCliSkills()
          const data = await mp.fetchData(workspace, skills)
          this.postMessage({ type: "marketplaceData", ...data })
          break
        }
        case "filterMarketplaceItems": {
          // Client-side filtering — no server action needed
          break
        }
        case "installMarketplaceItem": {
          const workspace = this.getProjectDirectory(this.currentSession?.id)
          const scope = message.mpInstallOptions?.target ?? "project"
          const result = await this.getMarketplace().install(message.mpItem, message.mpInstallOptions, workspace)
          if (result.success) {
            await this.invalidateAfterMarketplaceChange(scope)
          }
          this.postMessage({
            type: "marketplaceInstallResult",
            success: result.success,
            slug: result.slug,
            error: result.error,
          })
          break
        }
        case "removeInstalledMarketplaceItem": {
          const scope = message.mpInstallOptions?.target ?? "project"
          const result = await this.removeMarketplaceItem(message.mpItem, scope)
          this.postMessage({
            type: "marketplaceRemoveResult",
            success: result.success,
            slug: result.slug,
            error: result.error,
          })
          break
        }
      }
    })
  }

  private openExternal(url: unknown): void {
    if (typeof url !== "string") return
    void vscode.env.openExternal(vscode.Uri.parse(url))
  }

  private openDiffVirtual(diff: unknown, initialDiffStyle?: unknown): void {
    if (!this.diffVirtualProvider || !diff) return
    const d = diff as import("./DiffVirtualProvider").DiffVirtualFile
    d.initialDiffStyle = initialDiffStyle === "split" ? "split" : "unified"
    this.diffVirtualProvider.open(d)
  }

  /**
   * Initialize connection to the CLI backend server.
   * Subscribes to the shared StrataConnectionService.
   */
  private initializeConnection(): Promise<void> {
    if (this.initConnectionPromise) {
      return this.initConnectionPromise
    }
    this.initConnectionPromise = this.doInitializeConnection().finally(() => {
      this.initConnectionPromise = null
    })
    return this.initConnectionPromise
  }

  private async doInitializeConnection(): Promise<void> {
    Logger.info("StrataProvider", "🔧 Starting initializeConnection...")

    this.connectionState = "connecting"
    this.postMessage({ type: "connectionState", state: "connecting" })

    // Clean up any existing subscriptions (e.g., sidebar re-shown)
    this.unsubscribeEvent?.()
    this.unsubscribeState?.()
    this.unsubscribeNotificationDismiss?.()
    this.unsubscribeLanguageChange?.()
    this.unsubscribeProfileChange?.()
    this.unsubscribeFavoritesChange?.()
    this.unsubscribeClearPendingPrompts?.()
    this.unsubscribeDirectoryProvider?.()

    try {
      const workspaceDir = this.getWorkspaceDirectory()

      // Connect the shared service (no-op if already connected)
      await this.connectionService.connect(workspaceDir)

      // Subscribe to SSE events for this webview (filtered by tracked sessions)
      this.unsubscribeEvent = this.connectionService.onEventFiltered(
        (event) => {
          // Remote status events are global and should always pass through
          if (event.type === "strata-sessions.remote-status-changed") return true
          const sessionId = this.connectionService.resolveEventSessionId(event)

          // message.part.updated and message.part.delta are always session-scoped; drop if session unknown.
          if (!sessionId) {
            return event.type !== "message.part.updated" && event.type !== "message.part.delta"
          }

          if (event.type === "session.created" && this.matchesPendingFollowup(event.properties.info)) {
            return true
          }

          // session.status must always pass through — even for sessions not tracked by this
          // StrataProvider instance. The Settings panel is a separate provider with no tracked
          // sessions, but it needs session.status to populate sessionStatusMap and allStatusMap
          // for the busy-session warning on Save.
          if (event.type === "session.status") return true

          return this.trackedSessionIds.has(sessionId)
        },
        (event) => {
          this.handleEvent(event)
        },
      )

      // Subscribe to connection state changes
      this.unsubscribeState = this.connectionService.onStateChange(async (state) => {
        this.connectionState = state
        this.postMessage({ type: "connectionState", state })

        if (state === "connected") {
          // Fire config warnings independently so a failure in the
          // sequential await chain doesn't prevent warnings from being shown
          void this.checkConfigWarnings("state")
          try {
            // Profile fetch is best-effort — returns 401 when user isn't logged into gateway.
            const sdkClient = this.client
            if (sdkClient && isEnabled("strataAuth")) {
              const profileResult = await sdkClient.strata.profile()
              this.postMessage({ type: "profileData", data: profileResult.data ?? null })
            }
            await this.syncWebviewState("sse-connected")
            await this.flushPendingSessionRefresh("sse-connected")
            this.recoverPendingPrompts()
          } catch (error) {
            Logger.error("StrataProvider", "❌ Failed during connected state handling:", error)
            this.postMessage({
              type: "error",
              message: getErrorMessage(error) || "Failed to sync after connecting",
            })
          }
        }
      })

      // Subscribe to notification dismiss broadcast from other StrataProvider instances
      this.unsubscribeNotificationDismiss = this.connectionService.onNotificationDismissed(() => {
        this.fetchAndSendNotifications()
      })

      // Subscribe to language change broadcast from other StrataProvider instances
      this.unsubscribeLanguageChange = this.connectionService.onLanguageChanged((locale) => {
        this.postMessage({ type: "languageChanged", locale })
      })

      // Subscribe to profile change broadcast from other StrataProvider instances
      this.unsubscribeProfileChange = this.connectionService.onProfileChanged((data) => {
        this.postMessage({ type: "profileData", data })
      })

      // Subscribe to favorites change broadcast from other StrataProvider instances
      this.unsubscribeFavoritesChange = this.connectionService.onFavoritesChanged((favorites) => {
        this.postMessage({ type: "favoritesLoaded", favorites })
      })

      // legacy-migration start
      // Subscribe to migration-complete broadcast from any StrataProvider instance
      this.unsubscribeMigrationComplete = this.connectionService.onMigrationComplete(() => {
        this.postMessage({ type: "migrationState", needed: false })
      })
      // legacy-migration end

      // Subscribe to clear-pending-prompts broadcast (fired after config save drains prompts)
      this.unsubscribeClearPendingPrompts = this.connectionService.onClearPendingPrompts(() => {
        this.postMessage({ type: "clearPendingPrompts" })
      })

      // Register this provider's directories so drainPendingPrompts() covers all instances
      this.unsubscribeDirectoryProvider = this.connectionService.registerDirectoryProvider(() => {
        return [this.getWorkspaceDirectory(), ...this.sessionDirectories.values()]
      })

      // Get current state and push to webview
      const serverInfo = this.connectionService.getServerInfo()
      this.connectionState = this.connectionService.getConnectionState()

      if (serverInfo) {
        const langConfig = vscode.workspace.getConfiguration("strata-code.new")
        this.postMessage({
          type: "ready",
          serverInfo,
          extensionVersion: this.extensionVersion,
          vscodeLanguage: vscode.env.language,
          languageOverride: langConfig.get<string>("language"),
          workspaceDirectory: this.getProjectDirectory(this.currentSession?.id),
        })
      }

      this.postMessage({ type: "connectionState", state: this.connectionState })

      // connect() can resolve after SSE reaches "connected" but before this
      // provider subscribes to onStateChange(). In that case the initial
      // connected callback is missed, so run the warning check here too.
      if (this.connectionState === "connected") {
        void this.checkConfigWarnings("init")
      }

      await this.syncWebviewState("initializeConnection")
      await this.flushPendingSessionRefresh("initializeConnection")
      this.recoverPendingPrompts()

      // Sync specific VS Code settings to the CLI backend config before fetching agents
      const config = vscode.workspace.getConfiguration("strata-code.new")
      const enabled = isEnabled("workers")
      const review = isEnabled("reviewerWorker")
      const auto_explain = isEnabled("explainerWorker") || config.get<boolean>("workers.autoExplain", false)
      const polling_interval_sec = config.get<number>("workers.pollingIntervalSec", 5)
      const summarizer_prompt = config.get<string>("workers.summarizerPrompt", "")
      const review_prompt = config.get<string>("workers.reviewPrompt", "")
      const explainer_prompt = config.get<string>("workers.explainerPrompt", "")

      try {
        await this.client?.global.config.update({
          config: {
            workers: {
              enabled,
              review,
              auto_explain,
              polling_interval_sec,
              summarizer_prompt,
              review_prompt,
              explainer_prompt,
            },
          },
        })
      } catch (err) {
        Logger.error("StrataProvider", "Failed to sync workers.enabled to backend during init", err)
      }

      // Fetch providers, agents, skills, config, notifications, and session statuses in parallel
      await Promise.all([
        this.fetchAndSendProviders(),
        this.fetchAndSendAgents(),
        this.fetchAndSendSkills(),
        this.fetchAndSendCommands(),
        this.fetchAndSendConfig(),
        this.fetchAndSendIndexingStatus(),
        this.fetchAndSendNotifications(),
        this.seedSessionStatusMap(),
      ])
      this.cachedGitRepo = await hasGit(this.client!, this.getWorkspaceDirectory())
      this.postMessage({ type: "gitStatus", repo: this.cachedGitRepo })
      this.sendNotificationSettings()
      this.sendTimelineSetting()
      this.postMessage({ type: "extensionDataReady" })

      if (this.cachedGitRepo) this.startStatsPolling()

      Logger.info("StrataProvider", "✅ initializeConnection completed successfully")
    } catch (error) {
      Logger.error("StrataProvider", "❌ Failed to initialize connection:", error)
      this.connectionState = "error"
      this.postMessage({
        type: "connectionState",
        state: "error",
        error: getErrorMessage(error) || "Failed to connect to CLI backend",
        ...(error instanceof ServerStartupError && {
          userMessage: error.userMessage,
          userDetails: error.userDetails,
        }),
      })
    }
  }

  private sessionToWebview(session: Session) {
    return sessionToWebview(session)
  }

  private async handleCreateSession(): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: "error",
        message: "Not connected to CLI backend",
      })
      return
    }

    try {
      const workspaceDir = this.getContextDirectory()
      const { data: session } = await this.client.session.create({ directory: workspaceDir }, { throwOnError: true })
      this.currentSession = session
      this.contextSessionID = session.id
      this.trackDirectory(session.id, workspaceDir)
      this.trackedSessionIds.add(session.id)

      // Notify webview of the new session
      this.postMessage({
        type: "sessionCreated",
        session: this.sessionToWebview(this.currentSession!),
      })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to create session:", error)
      this.postMessage({
        type: "error",
        message: getErrorMessage(error) || "Failed to create session",
      })
    }
  }

  /** Non-blocking: refresh session metadata + status for the webview after switching. */
  private refreshSessionDetails(sessionID: string, dir: string, signal?: AbortSignal): void {
    if (!this.client) return
    this.client.session
      .get({ sessionID, directory: dir })
      .then((r) => {
        if (r.data && !signal?.aborted) {
          this.currentSession = r.data
          this.contextSessionID = r.data.id
        }
      })
      .catch((e: unknown) => Logger.warn("StrataProvider", "getSession failed (non-critical):", e))
    this.postMessage({ type: "workspaceDirectoryChanged", directory: this.getWorkspaceDirectory(sessionID) })
    this.client.session
      .status({ directory: dir })
      .then((r) => {
        if (!r.data || signal?.aborted) return
        for (const [sid, info] of Object.entries(r.data) as [string, SessionStatus][]) {
          if (!this.trackedSessionIds.has(sid)) continue
          this.postMessage({
            type: "sessionStatus",
            sessionID: sid,
            status: info.type,
            ...(info.type === "retry" ? { attempt: info.attempt, message: info.message, next: info.next } : {}),
          })
        }
      })
      .catch((e: unknown) => Logger.error("StrataProvider", "Failed to fetch session statuses:", e))
  }

  private async processMessagePage(
    sessionID: string,
    dir: string,
    mode: MessageLoadMode,
    limit: number,
    before?: string,
    abort?: AbortController,
  ): Promise<void> {
    try {
      const page = await fetchMessagePage(this.client!, {
        sessionID,
        workspaceDir: dir,
        limit,
        before,
        signal: abort?.signal,
      })
      if (abort?.signal.aborted) return
      // Drop results for a session deleted mid-fetch. Prepend/reconcile have
      // no abort controller, so this guard prevents ghost entries.
      if (!this.trackedSessionIds.has(sessionID)) return
      const messages = page.items.map((m) => ({
        ...m.info,
        parts: this.slimParts(m.parts),
        createdAt: new Date(m.info.time.created).toISOString(),
      }))
      for (const message of messages) {
        this.connectionService.recordMessageSessionId(message.id, message.sessionID)
      }
      // Authoritative snapshot: drop queued deltas. Prepend is older history
      // and must not clobber live deltas.
      if (mode === "replace" || mode === "reconcile") this.streams.drop(sessionID)
      if (mode === "reconcile") this.lastReconciledAt.set(sessionID, Date.now())
      this.postMessage({
        type: "messagesLoaded",
        sessionID,
        messages,
        mode,
        cursor: page.cursor,
        hasMore: Boolean(page.cursor),
      })
      // Recover any prompts missed while the webview was loading or during an SSE reconnection.
      this.recoverPendingPrompts()
    } catch (error) {
      if (abort?.signal.aborted) return
      Logger.error("StrataProvider", "Failed to load messages:", error)
      this.postMessage({ type: "error", message: getErrorMessage(error) || "Failed to load messages", sessionID })
    }
  }

  private async handleLoadMessages(
    sessionID: string,
    options: { mode?: MessageLoadMode; before?: string; limit?: number } = {},
  ): Promise<void> {
    const mode = options.mode ?? "replace"
    if (mode !== "prepend") {
      this.trackedSessionIds.add(sessionID)
      this.focusSession(sessionID)
      this.contextSessionID = sessionID
    }
    if (!this.client) {
      this.postMessage({ type: "error", message: "Not connected to CLI backend", sessionID })
      return
    }
    const dir = this.getWorkspaceDirectory(sessionID)
    if (mode === "focus") {
      this.refreshSessionDetails(sessionID, dir)
      // Reconcile tail so SSE drops self-heal. Throttled to skip rapid tab-switching bursts.
      if (Date.now() - (this.lastReconciledAt.get(sessionID) ?? 0) < 1000) return
      await this.handleLoadMessages(sessionID, { mode: "reconcile", limit: options.limit ?? MESSAGE_PAGE_LIMIT })
      return
    }
    // Replace competes for the spinner and cancels earlier loads; prepend/reconcile run in parallel.
    const abort = mode === "replace" ? new AbortController() : undefined
    if (abort) {
      this.loadMessagesAbort?.abort()
      this.loadMessagesAbort = abort
      this.refreshSessionDetails(sessionID, dir, abort.signal)
    }
    await this.processMessagePage(sessionID, dir, mode, options.limit ?? MESSAGE_PAGE_LIMIT, options.before, abort)
  }

  /**
   * Handle syncing a child session (e.g. spawned by the task tool).
   * Tracks the session for SSE events and fetches its messages.
   */
  private async handleSyncSession(sessionID: string, parentSessionID?: string): Promise<void> {
    if (!this.client) return
    if (this.syncedChildSessions.has(sessionID)) return

    this.syncedChildSessions.add(sessionID)
    this.trackedSessionIds.add(sessionID)

    // Inherit the parent's worktree directory so permission responses use
    // the correct backend Instance. Without this, child sessions in Agent
    // Manager worktrees fall back to workspace root and fail to find the
    // pending permission request.
    if (!this.sessionDirectories.has(sessionID) && parentSessionID) {
      const dir = this.sessionDirectories.get(parentSessionID)
      if (dir) {
        this.sessionDirectories.set(sessionID, dir)
      }
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory(sessionID)
      const { data: messagesData } = await retry(() =>
        this.client!.session.messages({ sessionID, directory: workspaceDir }, { throwOnError: true }),
      )

      const messages = messagesData.map((m) => ({
        ...m.info,
        parts: this.slimParts(m.parts),
        createdAt: new Date(m.info.time.created).toISOString(),
      }))

      for (const message of messages) {
        this.connectionService.recordMessageSessionId(message.id, message.sessionID)
      }

      // Snapshot supersedes any queued deltas (see handleLoadMessages for the
      // snapshot-freshness assumption that governs drop() here).
      this.streams.drop(sessionID)
      this.postMessage({
        type: "messagesLoaded",
        sessionID,
        messages,
        mode: "replace",
        hasMore: false,
      })

      // Recover any prompts emitted by the child before we started tracking it.
      this.recoverPendingPrompts()
    } catch (err) {
      this.syncedChildSessions.delete(sessionID)
      Logger.error("StrataProvider", "Failed to sync child session:", err)
    }
  }

  /**
   * Build the context object used by the extracted session-refresh helpers.
   */
  private get sessionRefreshContext(): SessionRefreshContext {
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
  private async flushPendingSessionRefresh(reason: string): Promise<void> {
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
  private async handleLoadSessions(): Promise<void> {
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

  private async handleTerminalContext(requestId: string): Promise<void> {
    try {
      const output = await getTerminalContents(-1)
      this.postMessage({
        type: "terminalContextResult",
        requestId,
        content: output.content,
        truncated: output.truncated,
      })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to capture terminal context:", error)
      this.postMessage({
        type: "terminalContextError",
        requestId,
        error: getErrorMessage(error) || "Failed to capture terminal output",
      })
    }
  }

  /**
   * Handle deleting a session.
   */
  private async handleDeleteSession(sessionID: string): Promise<void> {
    if (!this.client) {
      this.postMessage({ type: "error", message: "Not connected to CLI backend" })
      return
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory(sessionID)
      await this.client.session.delete({ sessionID, directory: workspaceDir }, { throwOnError: true })
      this.trackedSessionIds.delete(sessionID)
      this.streams.drop(sessionID)
      this.syncedChildSessions.delete(sessionID)
      this.sessionDirectories.delete(sessionID)
      this.lastReconciledAt.delete(sessionID)
      this.connectionService.pruneSession(sessionID)
      if (this.currentSession?.id === sessionID) {
        this.currentSession = null
        this.focusSession(undefined)
      }
      this.postMessage({ type: "sessionDeleted", sessionID })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to delete session:", error)
      this.postMessage({
        type: "error",
        message: getErrorMessage(error) || "Failed to delete session",
      })
    }
  }

  /**
   * Handle renaming a session.
   */
  private async handleRenameSession(sessionID: string, title: string): Promise<void> {
    if (!this.client) {
      this.postMessage({ type: "error", message: "Not connected to CLI backend" })
      return
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory(sessionID)
      const { data: updated } = await this.client.session.update(
        { sessionID, directory: workspaceDir, title },
        { throwOnError: true },
      )
      if (this.currentSession?.id === sessionID) {
        this.currentSession = updated
      }
      this.postMessage({ type: "sessionUpdated", session: this.sessionToWebview(updated) })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to rename session:", error)
      this.postMessage({
        type: "error",
        message: getErrorMessage(error) || "Failed to rename session",
      })
    }
  }

  /** Fetch providers and send to webview. Coalesced: at most one in-flight + one queued. */
  private async fetchAndSendProviders(): Promise<void> {
    const next = ++this.providersGeneration
    if (this.providersRefresh) {
      this.providersQueued = true
      await this.providersRefresh
      return
    }
    const task = (async () => {
      let generation = next
      while (true) {
        this.providersQueued = false
        const client = this.client
        if (!client) {
          if (this.cachedProvidersMessage && generation === this.providersGeneration)
            this.postMessage(this.cachedProvidersMessage)
          return
        }
        try {
          const { response, authMethods, authStates } = await fetchProviderData(client, this.getWorkspaceDirectory())
          if (generation !== this.providersGeneration || client !== this.client) {
            if (!this.providersQueued) return
            generation = this.providersGeneration
            continue
          }
          const settings = vscode.workspace.getConfiguration("strata-code.new.model")
          const message = {
            type: "providersLoaded",
            providers: indexProvidersById(response.all),
            connected: response.connected,
            defaults: response.default,
            defaultSelection: computeDefaultSelection(
              this.cachedConfigMessage as { config?: { model?: string } } | null,
              settings.get<string>("providerID", ""),
              settings.get<string>("modelID", ""),
            ),
            authMethods,
            authStates,
          }
          this.cachedProvidersMessage = message
          this.postMessage(message)
        } catch (error) {
          if (generation !== this.providersGeneration) {
            if (!this.providersQueued) return
            generation = this.providersGeneration
            continue
          }
          Logger.error("StrataProvider", "Failed to fetch providers:", error)
        }
        if (!this.providersQueued) return
        generation = this.providersGeneration
      }
    })()
    const done = task.finally(() => {
      if (this.providersRefresh === done) this.providersRefresh = null
    })
    this.providersRefresh = done
    await done
  }

  private async handleProviderAction(msg: Record<string, unknown>): Promise<void> {
    const rid = typeof msg.requestId === "string" ? msg.requestId : ""
    const pid = typeof msg.providerID === "string" ? msg.providerID : ""
    if (!rid || !pid) return
    if (!this.client) {
      const action =
        msg.type === "disconnectProvider"
          ? "disconnect"
          : msg.type === "authorizeProviderOAuth"
            ? "authorize"
            : "connect"
      this.postMessage({
        type: "providerActionError",
        requestId: rid,
        providerID: pid,
        action,
        message: "Not connected to CLI backend",
      })
      return
    }
    const ctx = buildActionContext(
      this.client,
      (m) => this.postMessage(m),
      getErrorMessage,
      this.getWorkspaceDirectory(),
      () => this.fetchAndSendProviders(),
    )
    const set = (m: unknown) => {
      this.cachedConfigMessage = m
    }
    const method = typeof msg.method === "number" ? msg.method : 0
    const key = typeof msg.apiKey === "string" ? msg.apiKey : undefined
    const keyChanged = msg.apiKeyChanged === true
    const code = typeof msg.code === "string" ? msg.code : undefined
    const config = msg.config && typeof msg.config === "object" ? (msg.config as Record<string, unknown>) : undefined
    if (msg.type === "connectProvider" && key) return connectProviderAction(ctx, rid, pid, key)
    if (msg.type === "authorizeProviderOAuth") return authorizeOAuthAction(ctx, rid, pid, method)
    if (msg.type === "completeProviderOAuth") return completeOAuthAction(ctx, rid, pid, method, code)
    if (msg.type === "disconnectProvider") return disconnectProviderAction(ctx, rid, pid, this.cachedConfigMessage, set)
    if (msg.type === "saveCustomProvider" && config)
      return saveCustomProviderAction(ctx, rid, pid, config, key, keyChanged, this.cachedConfigMessage, set)
  }

  private async handleFetchCustomProviderModels(msg: Record<string, unknown>): Promise<void> {
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
  private async fetchAndSendAgents(): Promise<void> {
    if (!this.client) {
      if (this.cachedAgentsMessage) {
        this.postMessage(this.cachedAgentsMessage)
      }
      return
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory()
      const { data: agents } = await retry(() =>
        this.client!.app.agents({ directory: workspaceDir }, { throwOnError: true }),
      )

      const { visible, defaultAgent } = filterVisibleAgents(agents)

      const message = {
        type: "agentsLoaded",
        agents: visible.map(mapAgent),
        allAgents: agents.map(mapAgent),
        defaultAgent,
      }
      this.cachedAgentsMessage = message
      this.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch agents:", error)
    }
  }

  private async fetchAndSendSkills(): Promise<void> {
    if (!this.client) {
      if (this.cachedSkillsMessage) {
        this.postMessage(this.cachedSkillsMessage)
      }
      return
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory()
      const { data: skills } = await retry(() =>
        this.client!.app.skills({ directory: workspaceDir }, { throwOnError: true }),
      )

      const message = {
        type: "skillsLoaded",
        skills,
      }
      this.cachedSkillsMessage = message
      this.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch skills:", error)
    }
  }

  private clearCommandsCache(): void {
    this.cachedCommandsMessage = null
    clearCommandsCache()
  }

  private async fetchAndSendCommands(): Promise<void> {
    if (!this.client) {
      if (this.cachedCommandsMessage) {
        this.postMessage(this.cachedCommandsMessage)
      }
      return
    }

    try {
      const dir = this.getWorkspaceDirectory()
      const message = await loadCommands(this.client, dir)

      this.cachedCommandsMessage = message
      this.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch commands:", error)
    }
  }

  private async fetchCliSkills(): Promise<Array<{ name: string; location: string }> | undefined> {
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
  private async removeSkillViaCli(location: string): Promise<boolean> {
    if (!this.client) return false
    try {
      const dir = this.getWorkspaceDirectory()
      const result = await this.client.stratacode.removeSkill({ location, directory: dir })
      if (result.error) {
        Logger.error("StrataProvider", "removeSkill returned error:", result.error)
        this.cachedSkillsMessage = null
        this.clearCommandsCache()
        await Promise.all([this.fetchAndSendSkills(), this.fetchAndSendCommands()])
        return false
      }
    } catch (error) {
      Logger.error("StrataProvider", "Failed to remove skill:", error)
      this.cachedSkillsMessage = null
      this.cachedCommandsMessage = null
      await Promise.all([this.fetchAndSendSkills(), this.fetchAndSendCommands()])
      return false
    }
    this.cachedSkillsMessage = null
    this.cachedCommandsMessage = null
    await Promise.all([this.fetchAndSendSkills(), this.fetchAndSendCommands()])
    return true
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
  private async handleRemoveMode(name: string): Promise<void> {
    if (!this.client) return

    let cleaned = false

    // 1. Try CLI removal (handles .md files, legacy .stratacodemodes, and global config)
    try {
      const dir = this.getWorkspaceDirectory()
      const result = await this.client.stratacode.removeAgent({ name, directory: dir })
      if (!result.error) cleaned = true
    } catch (err) {
      Logger.debug("StrataProvider", "CLI removeAgent failed, trying config:", err)
    }

    // 2. Remove from project-scope .strata/strata.json (plain JSON, no comments)
    const stub = { id: name, type: "mode" as const, name, description: "", content: "" }
    const mp = this.getMarketplace()
    const workspace = this.getProjectDirectory(this.currentSession?.id)
    try {
      await mp.remove(stub, "project", workspace)
    } catch (err) {
      Logger.debug("StrataProvider", "project config agent removal skipped:", err)
    }

    // Invalidate all caches and re-fetch
    this.cachedAgentsMessage = null
    this.cachedConfigMessage = null
    await Promise.all([this.fetchAndSendAgents(), this.fetchAndSendConfig(), this.fetchAndSendSkills()])

    if (!cleaned) {
      Logger.error("StrataProvider", "Failed to remove mode:", name)
    }
  }

  private async handleRemoveMcp(name: string): Promise<void> {
    // Remove from legacy files first so that the subsequent invalidation
    // causes the CLI to re-read config without the legacy entry.
    await this.removeLegacyMcp(name)

    // Remove from global config via CLI (preserves JSONC comments)
    try {
      await this.client!.global.config.update({ config: { mcp: { [name]: null } } as any }, { throwOnError: true })
    } catch (err) {
      Logger.debug("StrataProvider", "global config MCP removal skipped:", err)
    }

    // Remove from project-scope .strata/strata.json
    const stub = { id: name, type: "mcp" as const, name, description: "", url: "", content: "" }
    const mp = this.getMarketplace()
    const workspace = this.getProjectDirectory(this.currentSession?.id)
    try {
      await mp.remove(stub, "project", workspace)
    } catch (err) {
      Logger.debug("StrataProvider", "project config MCP removal skipped:", err)
    }

    // Invalidate all caches and re-fetch
    this.cachedAgentsMessage = null
    this.cachedConfigMessage = null
    const dir = this.getWorkspaceDirectory()
    try {
      await this.client!.instance.dispose({ directory: dir })
    } catch (err) {
      Logger.debug("StrataProvider", "instance dispose after MCP removal:", err)
    }
    await Promise.all([this.fetchAndSendAgents(), this.fetchAndSendConfig(), this.fetchAndSendSkills()])
  }

  /**
   * Remove an MCP server from legacy config files (.strata/mcp.json, .stratacode/mcp.json,
   * and the VS Code global storage mcp_settings.json). These files are read by the
   * CLI-side McpMigrator and merged into config at the lowest precedence level.
   * Returns true if the entry was found and removed from at least one file.
   */
  private async removeLegacyMcp(name: string): Promise<boolean> {
    const workspace = this.getProjectDirectory(this.currentSession?.id)
    const files: vscode.Uri[] = []

    // Project-level legacy files
    if (workspace) {
      files.push(vscode.Uri.file(path.join(workspace, ".strata", "mcp.json")))
      files.push(vscode.Uri.file(path.join(workspace, ".stratacode", "mcp.json")))
    }

    // Global legacy file (VS Code extension global storage)
    const storage = this.extensionContext?.globalStorageUri
    if (storage) {
      files.push(vscode.Uri.joinPath(storage, "settings", "mcp_settings.json"))
    }

    let removed = false
    for (const uri of files) {
      const bytes = await vscode.workspace.fs.readFile(uri).then(
        (b) => b,
        () => null,
      )
      if (!bytes) continue

      try {
        const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>
        const servers = parsed.mcpServers as Record<string, unknown> | undefined
        if (!servers?.[name]) continue

        delete servers[name]
        const content = Buffer.from(JSON.stringify(parsed, null, 2), "utf8")
        await vscode.workspace.fs.writeFile(uri, content)
        removed = true
      } catch (err) {
        Logger.warn("StrataProvider", `Failed to remove legacy MCP from ${uri.fsPath}`, err)
      }
    }

    return removed
  }

  private async fetchAndSendMcpStatus(): Promise<void> {
    if (!this.client) {
      if (this.cachedMcpStatusMessage) {
        this.postMessage(this.cachedMcpStatusMessage)
      }
      return
    }

    try {
      const directory = this.getWorkspaceDirectory()
      const { data } = await retry(() => this.client!.mcp.status({ directory }))
      if (data) {
        const message = { type: "mcpStatusLoaded", status: data }
        this.cachedMcpStatusMessage = message
        this.postMessage(message)
      }
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch MCP status:", error)
    }
  }

  private async handleConnectMcp(name: string): Promise<void> {
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

  private async handleDisconnectMcp(name: string): Promise<void> {
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
  private async removeMarketplaceItem(item: MarketplaceItem, scope: "project" | "global"): Promise<RemoveResult> {
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
  private async removeMarketplaceItemFromAllScopes(item: MarketplaceItem): Promise<boolean> {
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
  private async invalidateAfterMarketplaceChange(scope: "project" | "global"): Promise<void> {
    if (!this.client) return
    if (scope === "global") {
      // Use global.config.update with an empty config to trigger Config.updateGlobal()
      // which calls Config.global.reset(). This invalidates the lazy-cached global
      // config in the CLI process so it re-reads strata.json from disk.
      // An empty object merge is a no-op for the file content but resets the cache.
      // (global.dispose alone is insufficient on older CLI versions that lack
      // the Config.global.reset() call in the dispose handler.)
      await this.client.global.config.update({ config: {} }).catch((e: unknown) => {
        Logger.warn("StrataProvider", "global.config.update after marketplace change failed:", e)
      })
    }
    // Always dispose the per-project instance so it rebuilds state from
    // the (possibly updated) global + project config on the next request.
    const dir = this.getWorkspaceDirectory()
    await this.client.instance.dispose({ directory: dir }).catch((e: unknown) => {
      Logger.warn("StrataProvider", "instance.dispose() after marketplace change failed:", e)
    })
    this.cachedAgentsMessage = null
    this.cachedConfigMessage = null
    await Promise.all([this.fetchAndSendAgents(), this.fetchAndSendConfig(), this.fetchAndSendSkills()])
  }

  /**
   * Fetch backend config and send to webview.
   */
  private async fetchAndSendConfig(): Promise<void> {
    if (!this.client || this.connectionState !== "connected") {
      if (this.cachedConfigMessage) {
        this.postMessage(this.cachedConfigMessage)
      }
      return
    }

    // Skip if handleUpdateConfig is in flight — sending a configLoaded now
    // would race with the write and potentially overwrite optimistic webview state.
    if (this.pending > 0) {
      return
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory()
      const { data: config } = await retry(() =>
        this.client!.config.get({ directory: workspaceDir }, { throwOnError: true }),
      )

      const message = {
        type: "configLoaded",
        config,
        features: configFeatures(config),
      }
      this.cachedConfigMessage = message
      this.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch config:", error)
    }
  }

  /** Fetch global-only config (no project/managed layers) for settings export. */
  private async fetchAndSendGlobalConfig(): Promise<void> {
    if (!this.client || this.connectionState !== "connected") return
    try {
      const { data: config } = await this.client.global.config.get({ throwOnError: true })
      this.postMessage({ type: "globalConfigLoaded", config })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch global config:", error)
    }
  }

  private async fetchAndSendIndexingStatus(): Promise<void> {
    if (!this.client) {
      if (this.cachedIndexingStatusMessage) {
        this.postMessage(this.cachedIndexingStatusMessage)
      }
      return
    }

    const config = this.connectionService.getServerConfig()
    if (!config) return

    try {
      const dir = this.getWorkspaceDirectory(this.currentSession?.id)
      const auth = Buffer.from(`strata:${config.password}`).toString("base64")
      const res = await fetch(`${config.baseUrl}/indexing/status`, {
        headers: {
          Authorization: `Basic ${auth}`,
          ...(dir ? { "x-strata-directory": dir } : {}),
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const status = (await res.json()) as IndexingStatus
      const message = {
        type: "indexingStatusLoaded",
        status,
      }
      this.cachedIndexingStatusMessage = message
      this.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch indexing status:", error)
    }
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
  private async seedSessionStatusMap(reconcile = true): Promise<void> {
    if (!this.client || this.connectionState !== "connected") return
    const dir = this.getWorkspaceDirectory()
    await seedSessionStatuses(this.client, dir, this.sessionStatusMap, (msg) => this.postMessage(msg), reconcile)
  }

  /**
   * Fetch the latest merged config and push it as configUpdated.
   * Called when global.config.updated SSE fires (config changed without a full dispose).
   */
  private async fetchAndSendConfigUpdated(): Promise<void> {
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
  private async checkConfigWarnings(from: string): Promise<void> {
    if (this.configWarningsShown) {
      Logger.info("StrataProvider", "config warnings already shown", { from })
      return
    }
    if (!this.client) {
      Logger.info("StrataProvider", "config warnings skipped (no client)", { from })
      return
    }
    try {
      const dir = this.getWorkspaceDirectory()
      Logger.info("StrataProvider", "checking config warnings", { from, dir })
      const result = await this.client.config.warnings({ directory: dir })
      const list = result?.data ?? []
      Logger.info("StrataProvider", "config warnings fetched", { from, count: list.length })
      if (list.length === 0) return
      this.configWarningsShown = true

      const first = list[0]!
      const summary = list.length === 1 ? first.message : `${first.message} (and ${list.length - 1} more)`
      Logger.warn("StrataProvider", "showing config warnings", {
        from,
        count: list.length,
        path: first.path,
      })

      const action = await vscode.window.showWarningMessage(`Config: ${summary}`, "Show Details")
      if (action === "Show Details") {
        const lines = list.map((w) => {
          const base = `${w.path}\n  ${w.message}`
          return w.detail ? `${base}\n  ${w.detail}` : base
        })
        const channel = vscode.window.createOutputChannel("Strata Config Warnings")
        channel.clear()
        channel.appendLine(lines.join("\n\n"))
        channel.show()
      }
    } catch (err) {
      Logger.warn("StrataProvider", "checkConfigWarnings failed:", { from, err })
    }
  }

  /**
   * Fetch Strata news/notifications and send to webview.
   * Uses the cached message pattern so the webview gets data immediately on refresh.
   */
  private async fetchAndSendNotifications(): Promise<void> {
    if (!this.client) {
      if (this.cachedNotificationsMessage) {
        // Merge the latest dismissed IDs from globalState into the cached
        // message so that dismissals persisted while offline are honoured.
        const persisted = this.extensionContext?.globalState.get<string[]>("strata.dismissedNotificationIds", []) ?? []
        if (persisted.length > 0) {
          const cached = this.cachedNotificationsMessage as {
            type: string
            notifications: unknown[]
            dismissedIds: string[]
          }
          const merged = Array.from(new Set([...cached.dismissedIds, ...persisted]))
          this.cachedNotificationsMessage = { ...cached, dismissedIds: merged }
        }
        this.postMessage(this.cachedNotificationsMessage)
      }
      return
    }

    try {
      const { data: all } = await retry(() => this.client!.strata.notifications(undefined, { throwOnError: true }))
      const notifications = all.filter((n) => !n.showIn || n.showIn.includes("extension"))
      const existing = this.extensionContext?.globalState.get<string[]>("strata.dismissedNotificationIds", []) ?? []
      const active = new Set(notifications.map((n) => n.id))
      // Only prune stale dismissed IDs when we have a non-empty notification
      // list. An empty list may mean the API returned nothing due to being
      // unauthenticated (e.g. right after logout), not that all notifications
      // are gone — pruning in that case would wipe the persisted dismissals.
      const dismissedIds = notifications.length > 0 ? existing.filter((id) => active.has(id)) : existing
      if (dismissedIds.length !== existing.length) {
        await this.extensionContext?.globalState.update("strata.dismissedNotificationIds", dismissedIds)
      }
      const message = { type: "notificationsLoaded", notifications, dismissedIds }
      this.cachedNotificationsMessage = message
      this.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to fetch notifications:", error)
    }
  }

  // Cloud session methods extracted to strata-provider/handlers/cloud-session.ts

  /**
   * Persist a dismissed notification ID in globalState and push updated lists to webview.
   */
  private async handleDismissNotification(notificationId: string): Promise<void> {
    if (!this.extensionContext) return
    const existing = this.extensionContext.globalState.get<string[]>("strata.dismissedNotificationIds", [])
    if (!existing.includes(notificationId)) {
      await this.extensionContext.globalState.update("strata.dismissedNotificationIds", [...existing, notificationId])
    }
    // Update the cached message so the dismiss persists even if
    // fetchAndSendNotifications() fails (e.g. no client / API error).
    if (this.cachedNotificationsMessage) {
      const cached = this.cachedNotificationsMessage as {
        type: string
        notifications: unknown[]
        dismissedIds: string[]
      }
      if (!cached.dismissedIds.includes(notificationId)) {
        this.cachedNotificationsMessage = {
          ...cached,
          dismissedIds: [...cached.dismissedIds, notificationId],
        }
      }
    }
    await this.fetchAndSendNotifications()
    this.connectionService.notifyNotificationDismissed(notificationId)
  }

  /**
   * Read notification/sound settings from VS Code config and push to webview.
   */
  private sendNotificationSettings(): void {
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

  private sendTimelineSetting(): void {
    const config = vscode.workspace.getConfiguration("strata-code.new")
    this.postMessage({
      type: "timelineSettingLoaded",
      visible: config.get<boolean>("features.taskTimeline", true),
    })
  }

  /** Returns the number of sessions currently in "busy" state. */
  private getBusySessionCount(): number {
    return getBusySessionCount(this.sessionStatusMap)
  }

  /**
   * Handle config update request from the webview.
   * Applies a partial config update via the global config endpoint, then pushes
   * the full merged config back to the webview.
   */
  private async handleUpdateConfig(partial: Partial<Config>): Promise<void> {
    if (!this.client || this.connectionState !== "connected") {
      this.postMessage({ type: "configUpdateFailed", message: "Not connected to CLI backend" })
      return
    }

    const refreshProviders =
      partial.provider !== undefined ||
      partial.disabled_providers !== undefined ||
      partial.enabled_providers !== undefined

    // Guard against fetchAndSendConfig pushing stale data while the write is in flight.
    this.pending++

    // Phase 1: write. Errors here = real save failures the user can fix + retry.
    try {
      await this.connectionService.drainPendingPrompts()
      await this.client.global.config.update({ config: partial }, { throwOnError: true })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to update config:", error)
      this.postMessage({
        type: "configUpdateFailed",
        message: getErrorMessage(error) || "Failed to update config",
        details: getConfigErrorDetails(error),
      })
      this.pending--
      return
    }

    // Phase 2: refresh. Config is already on disk — post-write errors are
    // transient, so send an optimistic configUpdated to clear the webview's
    // saving/draft state. SSE global.config.updated pushes the real data next.
    try {
      const dir = this.getWorkspaceDirectory()
      const { data: merged } = await retry(() => this.client!.config.get({ directory: dir }, { throwOnError: true }))
      this.cachedConfigMessage = { type: "configLoaded", config: merged, features: configFeatures(merged) }
      this.postMessage({ type: "configUpdated", config: merged, features: configFeatures(merged) })
      if (refreshProviders) await this.fetchAndSendProviders()
      if (partial.command !== undefined) {
        this.clearCommandsCache()
        await this.fetchAndSendCommands()
      }
      if (partial.skills !== undefined) {
        this.cachedSkillsMessage = null
        this.clearCommandsCache()
        await Promise.all([this.fetchAndSendSkills(), this.fetchAndSendCommands()])
      }
    } catch (error) {
      Logger.error("StrataProvider", "Config write succeeded but post-write refresh failed:", error)
      const cached = (this.cachedConfigMessage as { config?: unknown } | null)?.config
      const features = (this.cachedConfigMessage as { features?: unknown } | null)?.features
      const optimistic =
        cached && typeof cached === "object" ? { ...(cached as Record<string, unknown>), ...partial } : partial
      this.postMessage({
        type: "configUpdated",
        config: optimistic,
        features: features ?? configFeatures(optimistic as Config),
      })
    } finally {
      this.pending--
    }
  }

  /**
   * Ensure a session exists, creating one if needed. Returns the resolved
   * session ID and workspace directory, or undefined when the client is
   * disconnected.
   */
  private async resolveSession(
    sessionID?: string,
    draftID?: string,
  ): Promise<{ sid: string; dir: string } | undefined> {
    if (!this.client) return undefined

    const dir = sessionID ? this.getWorkspaceDirectory(sessionID) : this.getContextDirectory()

    if (!sessionID && !this.currentSession) {
      const { data: session } = await this.client.session.create({ directory: dir }, { throwOnError: true })
      this.currentSession = session
      this.contextSessionID = session.id
      this.trackDirectory(session.id, dir)
      this.trackedSessionIds.add(session.id)
      if (draftID) this.contextSessionID = session.id
      this.postMessage({
        type: "sessionCreated",
        session: this.sessionToWebview(session),
        draftID,
      })
    }

    const sid = sessionID || this.currentSession?.id
    if (!sid) throw new Error("No session available")
    this.trackedSessionIds.add(sid)
    return { sid, dir }
  }

  /** Abort controllers for active retry loops, keyed by session ID */
  private retryAbortControllers = new Map<string, AbortController>()

  /** Execute an SDK call with visible exponential backoff for retryable HTTP errors. */
  private async withRetry(
    fn: () => Promise<{ error?: unknown; response?: Response }>,
    sid: string,
    messageID?: string,
  ): Promise<void> {
    const abortController = new AbortController()
    this.retryAbortControllers.set(sid, abortController)

    try {
      for (let attempt = 1; ; attempt++) {
        if (abortController.signal.aborted) {
          // User cancelled — return normally without triggering sendMessageFailed
          return
        }

        const result = await fn()
        if (!result.error) return
        if (this.confirmations.has(messageID)) return

        const status = result.response?.status ?? 0

        // Non-retryable status codes fail immediately without retry
        if (!retryable(status)) {
          this.postMessage({ type: "sessionStatus", sessionID: sid, status: "idle" })
          throw result.error
        }

        // Stop retrying after MAX_RETRIES attempts
        if (attempt >= MAX_RETRIES) {
          this.postMessage({ type: "sessionStatus", sessionID: sid, status: "idle" })
          throw result.error
        }

        const delay = backoff(attempt, result.response?.headers)
        Logger.info(
          "StrataProvider",
          `[Strata New] StrataProvider: Retry on ${status}, attempt ${attempt}/${MAX_RETRIES}, delay ${delay}ms`,
        )

        this.postMessage({
          type: "sessionStatus",
          sessionID: sid,
          status: "retry",
          attempt,
          message: `Error (${status}). Retrying...`,
          next: Date.now() + delay,
        })

        // Wait for delay or until aborted
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer)
            abortController.signal.removeEventListener("abort", done)
            resolve()
          }
          const timer = setTimeout(done, delay)
          abortController.signal.addEventListener("abort", done, { once: true })
        })
        if (this.confirmations.has(messageID)) return
      }
    } finally {
      this.retryAbortControllers.delete(sid)
    }
  }

  /** Cancel an active retry loop for a session */
  private cancelRetry(sid: string): void {
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
    if (!this.client) {
      this.postMessage({
        type: "sendMessageFailed",
        error: "Not connected to CLI backend",
        text,
        sessionID,
        draftID,
        messageID,
        files,
      })
      return
    }

    let resolved: { sid: string; dir: string } | undefined
    try {
      resolved = await this.resolveSession(sessionID, draftID)

      const parts: Array<TextPartInput | FilePartInput> = []
      if (files) {
        for (const f of files) {
          parts.push({ type: "file", mime: f.mime, url: f.url, filename: f.filename, source: f.source })
        }
      }

      const sid = resolved!.sid
      const dir = resolved!.dir

      const cancelled = await applyPluginHooks(sid, dir, text, parts)
      if (cancelled) {
        Logger.warn("StrataProvider", `[Strata New] StrataProvider: Message to session ${sid} cancelled by plugin`)
        this.postMessage({
          type: "sendMessageFailed",
          error: "Message cancelled by plugin",
          text,
          sessionID: sid,
          draftID,
          messageID,
          files,
        })
        return
      }

      parts.push({ type: "text", text })

      const editorContext = await this.gatherEditorContext()

      if (messageID) {
        this.connectionService.recordMessageSessionId(messageID, sid)
      }

      markPending(sid)

      await runWithMessageConfirmation(this.confirmations, messageID, "StrataProvider: Message request", () =>
        this.withRetry(
          () =>
            this.client!.session.promptAsync({
              sessionID: sid,
              directory: dir,
              messageID,
              parts,
              model: providerID && modelID ? { providerID, modelID } : undefined,
              agent,
              variant,
              editorContext,
            }),
          sid,
          messageID,
        ),
      )
    } catch (error) {
      Logger.error("StrataProvider", "Failed to send message:", error)
      this.postMessage({
        type: "sendMessageFailed",
        error: getErrorMessage(error) || "Failed to send message",
        text,
        sessionID: resolved?.sid ?? sessionID,
        draftID,
        messageID,
        files,
      })
    }
  }

  private async handleSendCommand(
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
    if (!this.client) {
      this.postMessage({
        type: "sendMessageFailed",
        error: "Not connected to CLI backend",
        text: `/${command} ${args}`.trim(),
        sessionID,
        draftID,
        messageID,
        files,
      })
      return
    }

    let resolved: { sid: string; dir: string } | undefined
    try {
      resolved = await this.resolveSession(sessionID, draftID)

      if (messageID) {
        this.connectionService.recordMessageSessionId(messageID, resolved!.sid)
      }

      const parts = files?.map((f) => ({
        type: "file" as const,
        mime: f.mime,
        url: f.url,
        filename: f.filename,
        source: f.source,
      }))

      const sid = resolved!.sid
      const dir = resolved!.dir
      await runWithMessageConfirmation(this.confirmations, messageID, "StrataProvider: Command request", () =>
        this.withRetry(
          () =>
            this.client!.session.command({
              sessionID: sid,
              directory: dir,
              command,
              arguments: args,
              messageID,
              model: providerID && modelID ? `${providerID}/${modelID}` : undefined,
              agent,
              variant,
              parts,
            }),
          sid,
          messageID,
        ),
      )
    } catch (error) {
      Logger.error("StrataProvider", "Failed to send command:", error)
      this.postMessage({
        type: "sendMessageFailed",
        error: getErrorMessage(error) || "Failed to send command",
        text: `/${command} ${args}`.trim(),
        sessionID: resolved?.sid ?? sessionID,
        draftID,
        messageID,
        files,
      })
    }
  }

  private async handleAbort(sessionID?: string): Promise<void> {
    if (!this.client) {
      return
    }

    const targetSessionID = sessionID || this.currentSession?.id
    if (!targetSessionID) {
      return
    }

    try {
      await abortSession({
        client: this.client,
        sessionID: targetSessionID,
        dir: this.getWorkspaceDirectory(targetSessionID),
      })
    } catch (error) {
      Logger.error("StrataProvider", "Failed to abort session:", error)
    }
  }

  private async handleRevertSession(sessionID: string, messageID: string): Promise<void> {
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

  private async handleUnrevertSession(sessionID: string): Promise<void> {
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
  private async handleCompact(sessionID?: string, providerID?: string, modelID?: string): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: "error",
        message: "Not connected to CLI backend",
      })
      return
    }

    const target = sessionID || this.currentSession?.id
    if (!target) {
      Logger.error("StrataProvider", "No sessionID for compact")
      return
    }

    if (!providerID || !modelID) {
      Logger.error("StrataProvider", "No model selected for compact")
      this.postMessage({
        type: "error",
        message: "No model selected. Connect a provider to compact this session.",
      })
      return
    }

    try {
      const workspaceDir = this.getWorkspaceDirectory(target)
      await this.client.session.summarize(
        { sessionID: target, directory: workspaceDir, providerID, modelID },
        { throwOnError: true },
      )
    } catch (error) {
      Logger.error("StrataProvider", "Failed to compact session:", error)
      this.postMessage({
        type: "error",
        message: getErrorMessage(error) || "Failed to compact session",
      })
    }
  }

  // Permission + question handlers extracted to strata-provider/handlers/permission.ts and question.ts

  private get permissionCtx(): PermissionContext {
    return {
      client: this.client,
      currentSessionId: this.currentSession?.id,
      trackedSessionIds: this.trackedSessionIds,
      sessionDirectories: this.sessionDirectories,
      postMessage: (msg) => this.postMessage(msg),
      getWorkspaceDirectory: (sid) => this.getWorkspaceDirectory(sid),
    }
  }

  private get questionCtx() {
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

  private get cloudSessionCtx(): CloudSessionContext {
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

  private get authCtx(): AuthContext {
    return {
      client: this.client,
      postMessage: (msg) => this.postMessage(msg),
      getWorkspaceDirectory: () => this.getWorkspaceDirectory(),
      disposeGlobal: () => this.disposeGlobal(),
      fetchAndSendProviders: () => this.fetchAndSendProviders(),
      fetchAndSendAgents: () => this.fetchAndSendAgents(),
    }
  }

  private async disposeGlobal(): Promise<void> {
    if (!this.client) return

    await this.client.global
      .dispose()
      .catch((e: unknown) => Logger.warn("StrataProvider", "global.dispose() after org switch failed:", e))

    // Org switch succeeded — refresh profile and providers independently (best-effort)
    try {
      const profileResult = await this.client!.strata.profile()
      // Broadcast to all webviews (sidebar, profile tab, agent manager, etc.)
      this.connectionService.notifyProfileChanged(profileResult.data ?? null)
    } catch (error) {
      Logger.error("StrataProvider", "Failed to refresh profile after org switch:", error)
    }
    try {
      await this.fetchAndSendProviders()
    } catch (error) {
      Logger.error("StrataProvider", "Failed to refresh providers after org switch:", error)
    }
  }

  private handlePreviewImage(dataUrl: string, filename: string): void {
    const dir = this.extensionContext?.globalStorageUri
    if (!dir) return

    const img = parseImage(dataUrl, filename)
    if (!img) return

    const root = vscode.Uri.joinPath(dir, getPreviewDir())
    const uri = vscode.Uri.joinPath(dir, buildPreviewPath(img.name, Date.now()))
    const clean = () =>
      vscode.workspace.fs.readDirectory(root).then(
        (items) => {
          const stale = trimEntries(items.map(([name]) => ({ path: name })))
          return Promise.all(
            stale.map((name) =>
              Promise.resolve(vscode.workspace.fs.delete(vscode.Uri.joinPath(root, name), { recursive: true })).then(
                undefined,
                (err: unknown) => {
                  Logger.warn("StrataProvider", "Failed to delete stale preview:", err)
                },
              ),
            ),
          )
        },
        () => [],
      )
    const open = () =>
      vscode.commands
        .executeCommand(...getPreviewCommand(uri))
        .then(undefined, () => vscode.commands.executeCommand("vscode.open", uri))

    void vscode.workspace.fs
      .createDirectory(root)
      .then(() => vscode.workspace.fs.writeFile(uri, img.data))
      .then(() => clean())
      .then(open, (err) => Logger.error("StrataProvider", "Failed to preview image:", err))
  }

  /**
   * Handle openFile request from the webview — open a file in the VS Code editor.
   * Resolves relative paths against the current session's directory (which may be
   * a worktree path registered via setSessionDirectory), falling back to workspace root.
   * Absolute paths (Unix `/…` or Windows `C:\…`) are used as-is.
   */
  private handleOpenFile(filePath: string, line?: number, column?: number): void {
    const uri = isAbsolutePath(filePath)
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(vscode.Uri.file(this.getWorkspaceDirectory(this.currentSession?.id)), filePath)
    vscode.workspace.openTextDocument(uri).then(
      (doc) => {
        const options: vscode.TextDocumentShowOptions = { preview: true }
        if (line !== undefined && line > 0) {
          const col = column !== undefined && column > 0 ? column - 1 : 0
          const pos = new vscode.Position(line - 1, col)
          options.selection = new vscode.Range(pos, pos)
        }
        vscode.window.showTextDocument(doc, options)
      },
      (err) => Logger.error("StrataProvider", `Failed to open file: ${uri.fsPath}`, err),
    )
  }

  /**
   * Handle a generic setting update from the webview.
   * The key uses dot notation relative to `strata-code.new` (e.g. "browserAutomation.enabled").
   */
  private handleRequestSetting(key: string): void {
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

  private async handleDiffStartThread(
    threadId: string,
    file: string,
    line: number,
    endLine: number | undefined,
    text: string,
    side?: "left" | "right",
  ): Promise<void> {
    try {
      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root) {
        throw new Error("No workspace root found.")
      }

      if (!this.diffExplainSession) {
        const { data } = await client.session.create({ directory: root }, { throwOnError: true })
        this.diffExplainSession = data.id
        this.hideSession(data.id)
      }

      const prompt = [
        `You are an expert code explainer. The user is asking a question about a specific part of the code in the diff.`,
        `File: ${file}`,
        `Line: ${endLine !== undefined ? `${line}-${endLine}` : line}${side ? ` (${side === "left" ? "deletions" : "additions"} side)` : ""}`,
        `Question:`,
        `"${text}"`,
        ``,
        `Please reply directly to the user's question. Provide your answer in markdown format. Do NOT wrap your answer in JSON.`,
      ].join("\n")

      const res = await client.session.prompt(
        {
          sessionID: this.diffExplainSession,
          directory: root,
          agent: "explainer",
          parts: [{ type: "text", text: prompt }],
        },
        { throwOnError: true },
      )

      const part = res.data?.parts?.find((p: any) => p.type === "text")
      if (part && "text" in part) {
        this.postMessage({
          type: "diffViewer.threadReply",
          threadId,
          message: {
            id: Math.random().toString(36).substring(2, 9),
            author: "ai",
            text: part.text.trim(),
            timestamp: Date.now(),
          },
        })
      }
    } catch (err) {
      Logger.error("StrataProvider", "diffViewer.startThread failed:", err)
      this.postMessage({
        type: "diffViewer.threadReply",
        threadId,
        message: {
          id: Math.random().toString(36).substring(2, 9),
          author: "ai",
          text: `⚠️ Failed to start thread: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        },
      })
    }
  }

  private async handleDiffReplyToThread(threadId: string, text: string): Promise<void> {
    try {
      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root || !this.diffExplainSession) {
        this.postMessage({
          type: "diffViewer.threadReply",
          threadId,
          message: {
            id: Math.random().toString(36).substring(2, 9),
            author: "ai",
            text: "⚠️ Review session has expired. Please initiate a new explanation.",
            timestamp: Date.now(),
          },
        })
        return
      }

      const res = await client.session.prompt(
        {
          sessionID: this.diffExplainSession,
          directory: root,
          agent: "explainer",
          parts: [{ type: "text", text }],
        },
        { throwOnError: true },
      )

      const part = res.data?.parts?.find((p: any) => p.type === "text")
      if (part && "text" in part) {
        this.postMessage({
          type: "diffViewer.threadReply",
          threadId,
          message: {
            id: Math.random().toString(36).substring(2, 9),
            author: "ai",
            text: part.text.trim(),
            timestamp: Date.now(),
          },
        })
      }
    } catch (err) {
      Logger.error("StrataProvider", "diffViewer.replyToThread failed:", err)
      this.postMessage({
        type: "diffViewer.threadReply",
        threadId,
        message: {
          id: Math.random().toString(36).substring(2, 9),
          author: "ai",
          text: `⚠️ Failed to reply: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        },
      })
    }
  }

  private async processExplanationBatches(
    client: any,
    targetDirectory: string,
    validDiffs: { file: string; patch: string }[],
    sessionContext?: string
  ): Promise<void> {
    const BATCH_SIZE = 5
    let summary = ""

    for (let i = 0; i < validDiffs.length; i += BATCH_SIZE) {
      const chunk = validDiffs.slice(i, i + BATCH_SIZE)
      const last = i + BATCH_SIZE >= validDiffs.length
      const { annotatedDiffs, lineMap } = buildIndexedPatches(chunk)

      if (!annotatedDiffs.trim()) {
        if (last) {
          this.postMessage({
            type: "diffViewer.explainResult",
            threads: [],
            summary: summary || "Explanation completed.",
            done: true,
          })
        }
        continue
      }

      const prompt = buildExplainPrompt(annotatedDiffs, sessionContext)

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Explanation timed out after 60s")), 60_000)
      })

      const res = await Promise.race([
        client.session.prompt(
          {
            sessionID: this.diffExplainSession,
            directory: targetDirectory,
            agent: "explainer",
            parts: [{ type: "text", text: prompt }],
          },
          { throwOnError: true },
        ),
        timeout,
      ])

      if (timer) clearTimeout(timer)

      const part = res.data?.parts?.find((p: any) => p.type === "text")
      if (part && "text" in part) {
        const raw = part.text.trim()
        const parsed = parseExplainResponse(raw, lineMap)
        if (parsed.summary) summary = parsed.summary

        const threads: ReviewThread[] = parsed.comments.map((c) => ({
          id: Math.random().toString(36).substring(2, 9),
          file: c.file,
          side: c.side as "left" | "right" | "additions" | "deletions" | undefined,
          line: c.line,
          ...(c.endLine !== undefined ? { endLine: c.endLine } : {}),
          messages: [
            {
              id: Math.random().toString(36).substring(2, 9),
              author: "ai" as const,
              text: c.text,
              timestamp: Date.now(),
            },
          ],
          pending: false,
        }))

        this.postMessage({
          type: "diffViewer.explainResult",
          threads,
          summary: last ? summary || "Explanation completed." : undefined,
          done: last,
        })
      } else if (last) {
        this.postMessage({
          type: "diffViewer.explainResult",
          threads: [],
          summary: summary || "Explanation completed.",
          done: true,
        })
      }
    }
  }

  private async handleDiffExplainAll(message: any): Promise<void> {
    const worktreeId = message.worktreeId as string | undefined
    const root = this.getProjectDirectory(this.currentSession?.id)
    if (!root) {
      this.postMessage({ type: "diffViewer.explainResult", error: "No workspace root found.", done: true })
      return
    }
    const targetDirectory = worktreeId ? path.join(path.dirname(root), worktreeId) : root

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(targetDirectory))
    } catch {
      this.postMessage({
        type: "diffViewer.explainResult",
        error: `Target directory not found: ${targetDirectory}`,
        done: true,
      })
      return
    }

    try {
      const log = (...args: unknown[]) => Logger.debug("StrataProvider", "[explainAll]", ...args)
      const gitOps = new GitOps({ log })

      try {
        const anc = await localAncestor(gitOps, targetDirectory, "main", log)
        const diffs = await localDiffSummary(gitOps, targetDirectory, "main", log)

        const effort = vscode.workspace.getConfiguration("strata-code.new.explainer").get<string>("effort", "medium")

        const validDiffs: { file: string; patch: string }[] = []
        const candidates = diffs.filter((d) => !d.generatedLike)

        const patchMap = await batchPatches(
          gitOps,
          targetDirectory,
          anc ?? "",
          candidates.map((d) => ({ file: d.file, tracked: d.tracked })),
          log,
        )

        for (const d of candidates) {
          const patch = patchMap.get(d.file)
          if (!patch || shouldPreSkip(patch, effort)) continue
          validDiffs.push({ file: d.file, patch })
        }

        const { annotatedDiffs: firstCheck } = buildIndexedPatches(validDiffs)

        if (!firstCheck.trim()) {
          this.postMessage({
            type: "diffViewer.explainResult",
            threads: [],
            summary: "No complex changes to explain.",
            done: true,
          })
          return
        }

        const client = this.connectionService.getClient()

        if (!this.diffExplainSession) {
          const { data } = await client.session.create({ directory: targetDirectory }, { throwOnError: true })
          this.diffExplainSession = data.id
          this.connectionService.hideSession(data.id)
        }

        // Fetch session context once for all batches
        let sessionContext: string | undefined
        try {
          const res = await client.getWorkerContext({
            directory: targetDirectory,
            tier: "big",
          })
          if (res.data?.summary) sessionContext = res.data.summary
        } catch (err) {
          Logger.info("StrataProvider", "handleDiffExplainAll: session context fetch failed, continuing without", err)
        }

        await this.processExplanationBatches(client, targetDirectory, validDiffs, sessionContext)
      } finally {
        gitOps.dispose()
      }
    } catch (err) {
      Logger.error("StrataProvider", "diffViewer.explainAll failed:", err)
      this.postMessage({ type: "diffViewer.explainResult", error: String(err), done: true })
    }
  }

  private async handleUpdateSetting(key: string, value: unknown): Promise<void> {
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
  private async handleResetAllSettings(): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      "Reset all Strata Code extension settings to defaults?",
      { modal: true },
      "Reset",
    )
    if (confirmed !== "Reset") return

    const prefix = "strata-code.new."
    const ext = vscode.extensions.getExtension("stratacode.strata-code")
    const properties = ext?.packageJSON?.contributes?.configuration?.properties as Record<string, unknown> | undefined
    if (!properties) return

    for (const key of Object.keys(properties)) {
      if (!key.startsWith(prefix)) continue
      const parts = key.split(".")
      const section = parts.slice(0, -1).join(".")
      const leaf = parts[parts.length - 1]!
      const config = vscode.workspace.getConfiguration(section)
      await config.update(leaf, undefined, vscode.ConfigurationTarget.Global)
    }

    // Clear globalState items that are not part of the configuration
    await this.extensionContext?.globalState.update("variantSelections", undefined)
    await this.extensionContext?.globalState.update("recentModels", undefined)
    await this.extensionContext?.globalState.update("kanbanTasks", undefined)
    await this.extensionContext?.globalState.update("strata.dismissedNotificationIds", undefined)

    // Re-send all settings to the webview so the UI reflects the reset
    this.postMessage(AutocompleteSettingsManager.getInstance().buildAutocompleteSettingsMessage())
    this.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
    this.sendBrowserSettings()
    this.sendNotificationSettings()
    this.sendTimelineSetting()
    await ModelState.reset(this.client, (msg) => this.postMessage(msg))

    // Re-send globalState items to the webview
    this.postMessage({ type: "variantsLoaded", variants: {} })
    this.postMessage({ type: "recentsLoaded", recents: [] })

    // Re-fetch notifications to reflect cleared dismissed IDs
    await this.fetchAndSendNotifications()

    vscode.window.showInformationMessage("Strata Code settings have been reset to defaults.")
  }

  /**
   * Read the current browser automation settings and push them to the webview.
   */
  private sendBrowserSettings(): void {
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
  private sendClaudeCompatSetting(): void {
    const enabled = vscode.workspace.getConfiguration("strata-code.new").get<boolean>("claudeCodeCompat", false)
    this.postMessage({
      type: "claudeCompatSettingLoaded",
      enabled: enabled ?? false,
    })
  }

  /** Re-fetch all server-side state after an auth change. */
  private async reloadAfterAuthChange(): Promise<void> {
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
  private handleWorkerEvent(workerEvent: any): boolean {
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

  private handleSessionStatusEvent(event: Extract<Event, { type: "session.status" }>, sessionID: string): void {
    this.sessionStatusMap.set(sessionID, event.properties.status.type)
    checkCompletion(sessionID, event.properties.status.type)

    const msg = mapSSEEventToWebviewMessage(event, sessionID)
    if (msg) {
      this.streams.flush(sessionID)
      this.postMessage(msg)
    }
  }

  private handleGlobalAndServerEvents(event: Event): boolean {
    if (event.type === "global.disposed") {
      void this.reloadAfterAuthChange()
      return true
    }
    if (event.type === "server.instance.disposed") {
      const props = event.properties as Record<string, unknown> | null
      const dir = typeof props?.directory === "string" ? props.directory : undefined
      if (dir && path.resolve(dir) !== path.resolve(this.getWorkspaceDirectory())) return true
      void this.reloadAfterAuthChange()
      return true
    }
    if (event.type === "global.config.updated") {
      void this.fetchAndSendConfigUpdated()
      return true
    }
    return false
  }

  private handleSessionLifecycleEvents(event: Event): void {
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

  private handlePromptEvents(event: Event): void {
    if (event.type === "permission.asked" || event.type === "question.asked") {
      this.pendingPrompts++
      this.updateBadge()
      if (!this.sidebarVisible) {
        const enabled = vscode.workspace
          .getConfiguration("strata-code.new.notifications")
          .get<boolean>("permissions", true)
        if (enabled) {
          const label =
            event.type === "permission.asked"
              ? `Permission required: ${event.properties.permission ?? "tool"}`
              : "Agent is waiting for your response"
          void vscode.window.showInformationMessage(label, "Review").then((action) => {
            if (action === "Review") {
              vscode.commands.executeCommand(`${StrataProvider.viewType}.focus`)
            }
          })
        }
      }
    }
    if (
      (event.type === "permission.replied" ||
        event.type === "question.replied" ||
        event.type === "question.rejected") &&
      this.pendingPrompts > 0
    ) {
      this.pendingPrompts--
      this.updateBadge()
    }
  }

  private scheduleAutoApproveTimer(msg: any, config: any, agentName: string, isQuestion: boolean) {
    const agentConfig = agentName ? config.agent?.[agentName] : undefined
    const timeoutSeconds = isQuestion
      ? (agentConfig?.auto_approve?.question_timeout ?? config.auto_approve?.question_timeout ?? 0)
      : (agentConfig?.auto_approve?.timeout ?? config.auto_approve?.timeout ?? 0)

    if (timeoutSeconds <= 0) return

    const reqId = isQuestion ? msg.question.id : msg.permission.id
    this.autoApproveTimer.startTimer(reqId, timeoutSeconds, () => {
      if (!isQuestion) {
        handlePermissionResponse(this.permissionCtx, reqId, msg.permission.sessionID, "once", [], [], undefined, undefined)
      } else {
        const firstQ: any = msg.question.questions[0]
        const answers = firstQ?.options?.length ? [firstQ.options[0].label] : [""]
        handleQuestionReply(this.questionCtx, reqId, [answers], msg.question.sessionID)
      }
    })
  }

  private handleAutoApproveMessage(msg: any): void {
    if (msg.type === "permissionRequest" || msg.type === "questionRequest") {
      const config = (this.cachedConfigMessage as any)?.config
      if (config) {
        const isQuestion = msg.type === "questionRequest"
        const agentName = isQuestion ? (msg.question as any).agent : msg.permission.agent
        this.scheduleAutoApproveTimer(msg, config, agentName, isQuestion)
      }
    }
    if (msg.type === "permissionResolved" || msg.type === "permissionError") {
      if (this.autoApproveTimer.isTimerRunningFor(msg.permissionID)) this.autoApproveTimer.clearTimer()
    }
    if (msg.type === "questionResolved" || msg.type === "questionError") {
      if (this.autoApproveTimer.isTimerRunningFor(msg.requestID)) this.autoApproveTimer.clearTimer()
    }
  }

  private handleChildSessionEvent(event: Event, sessionID?: string): void {
    if (event.type === "message.part.updated") {
      const part = event.properties.part as {
        type?: string
        tool?: string
        metadata?: { sessionId?: string }
        state?: { metadata?: { sessionId?: string } }
        sessionID?: string
      }
      const childId = childID(part)
      if (childId && !this.trackedSessionIds.has(childId)) {
        Logger.info("StrataProvider", "🔗 Auto-adopting child session from task tool", { childId })
        void this.handleSyncSession(childId, part.sessionID ?? sessionID)
      }
    }
  }

  private isEventDropped(event: Event, sessionID: string | undefined): boolean {
    if (isEventFromForeignProject(event, this.projectID)) return true
    if (sessionID && this.connectionService.isSessionHidden(sessionID)) return true
    if (event.type === "session.created" && this.connectionService.isSessionHidden(event.properties.info.id)) return true
    if (!sessionID && (event.type === "message.part.updated" || event.type === "message.part.delta")) return true
    if (event.type !== "indexing.status" && sessionID && !this.trackedSessionIds.has(sessionID)) return true
    return false
  }

  private handleMessageEvent(event: Event, sessionID: string | undefined, directory?: string): void {
    if (event.type === "indexing.status" && directory) {
      const current = path.resolve(this.getWorkspaceDirectory(this.currentSession?.id))
      if (path.resolve(directory) !== current) return
    }

    const msg = mapSSEEventToWebviewMessage(event, sessionID)
    if (!msg) return
    if (msg.type === "partUpdated") {
      this.streams.push({ ...msg, part: this.slimPart(msg.part) })
      return
    }
    if (msg.type === "indexingStatusLoaded") {
      this.cachedIndexingStatusMessage = msg
    }
    if (sessionID) this.streams.flush(sessionID)
    this.postMessage(msg)

    this.handleAutoApproveMessage(msg)
  }

  private handleEvent(event: Event, directory?: string): void {
    if (event.type === "strata-sessions.remote-status-changed") {
      this.remoteService?.updateFromEvent({ enabled: event.properties.enabled, connected: event.properties.connected })
      return
    }

    if (this.handleWorkerEvent(event)) return

    if (event.type === "message.updated") {
      this.confirmations.confirm(event.properties.info.id)
    }

    if (event.type === "session.status") {
      this.handleSessionStatusEvent(event, event.properties.sessionID)
      return
    }

    if (event.type === "session.created" && this.adoptPendingFollowup(event.properties.info)) {
      return
    }

    const sessionID = this.connectionService.resolveEventSessionId(event)

    if (this.isEventDropped(event, sessionID)) return

    if (this.handleGlobalAndServerEvents(event)) return

    this.handleSessionLifecycleEvents(event)
    this.handleChildSessionEvent(event, sessionID)
    this.handlePromptEvents(event)

    handleNetworkEvent(event.type as string, event.properties as any, this.client, (s) => this.getWorkspaceDirectory(s))
    this.handleMessageEvent(event, sessionID, directory)
  }

  /** Set or clear the Activity Bar badge based on pending prompt count. */
  private updateBadge(): void {
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
    if (!this.webview) {
      const type =
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        typeof (message as { type?: unknown }).type === "string"
          ? (message as { type: string }).type
          : "<unknown>"
      Logger.warn("StrataProvider", "⚠️ postMessage dropped (no webview)", { type })
      return
    }

    void this.webview.postMessage(message).then(undefined, (error) => {
      Logger.error("StrataProvider", "❌ postMessage failed", error)
    })
  }

  public async appendReviewComments(comments: unknown[], autoSend = false): Promise<void> {
    this.pendingReviewComments.push({ comments, autoSend })

    if (!this.webview) {
      await vscode.commands.executeCommand(`${StrataProvider.viewType}.focus`)
    }

    this.flushPendingReviewComments()
  }

  private flushPendingReviewComments(): void {
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
  private async getGitRemoteUrl(): Promise<string | undefined> {
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
  private async getOpenTabPaths(dir: string): Promise<Set<string>> {
    const controller = await this.getIgnoreController(dir)
    const result = new Set<string>()
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const uri = tab.input.uri
          if (uri.scheme === "file") {
            const rel = path.relative(dir, uri.fsPath)
            if (!rel.startsWith("..") && !path.isAbsolute(rel) && controller.validateAccess(uri.fsPath)) {
              result.add(rel.replaceAll("\\", "/"))
            }
          }
        }
      }
    }
    return result
  }

  /**
   * Get or create a FileIgnoreController for the current workspace directory.
   * Reinitializes if the workspace directory has changed.
   */
  private async getIgnoreController(workspaceDir: string): Promise<FileIgnoreController> {
    if (this.ignoreController && this.ignoreControllerDir === workspaceDir) {
      return this.ignoreController
    }
    const controller = new FileIgnoreController(workspaceDir)
    await controller.initialize()
    this.ignoreController = controller
    this.ignoreControllerDir = workspaceDir
    return controller
  }

  private async gatherRepoContext(
    visibleFiles: string[],
  ): Promise<{ repoMap?: string; projectMemory?: { id: string; title: string; content: string }[] }> {
    let repoMap: string | undefined
    let projectMemory: { id: string; title: string; content: string }[] | undefined
    try {
      const client = this.connectionService.getClient()
      const config = (this.cachedConfigMessage as any)?.config

      if (client) {
        // Fetch Memory
        try {
          type SDKWithMemory = {
            memory: { list: () => Promise<{ data?: { id: string; title: string; content: string }[] }> }
          }
          const stratacode = client.stratacode as unknown as SDKWithMemory
          const res = await stratacode.memory.list()
          if (res.data) {
            projectMemory = res.data
          }
        } catch (e) {
          Logger.warn("StrataProvider", "Failed to fetch project memory:", e)
        }

        // Fetch RepoMap
        const budget = config?.repomap?.budget ?? 4096
        if (budget > 0) {
          const result = await client.repoMap.generate({
            budget,
            mentioned: visibleFiles, // Boost visible files
          })
          if (result.data) {
            repoMap = result.data.map
          }
        }
      }
    } catch (e) {
      Logger.error("StrataProvider", "Failed to generate repo map", e)
    }
    return { repoMap, projectMemory }
  }

  private async gatherEditorContext(): Promise<EditorContext> {
    const workspaceDir = this.getWorkspaceDirectory()
    const controller = await this.getIgnoreController(workspaceDir)

    const toRelative = (fsPath: string): string | undefined => {
      if (!workspaceDir) {
        return undefined
      }
      const relative = path.relative(workspaceDir, fsPath)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return undefined
      }
      return relative
    }

    // Visible files (capped to avoid bloating context, filtered through .stratacodeignore)
    const visibleFiles = vscode.window.visibleTextEditors
      .map((e) => e.document.uri)
      .filter((uri) => uri.scheme === "file")
      .map((uri) => toRelative(uri.fsPath))
      .filter((p): p is string => p !== undefined && controller.validateAccess(path.resolve(workspaceDir, p)))
      .slice(0, 200)

    // Open tabs — use instanceof TabInputText to exclude notebooks, diffs, custom editors
    const openTabs = [...(await this.getOpenTabPaths(workspaceDir))].slice(0, 20)

    // Active file (also filtered through .stratacodeignore)
    const activeEditor = vscode.window.activeTextEditor
    const activeRel =
      activeEditor?.document.uri.scheme === "file" ? toRelative(activeEditor.document.uri.fsPath) : undefined
    const activeFile = activeRel && controller.validateAccess(activeEditor!.document.uri.fsPath) ? activeRel : undefined

    // Shell
    const shell = vscode.env.shell || undefined

    const { repoMap, projectMemory } = await this.gatherRepoContext(visibleFiles)

    return {
      ...(visibleFiles.length > 0 ? { visibleFiles } : {}),
      ...(openTabs.length > 0 ? { openTabs } : {}),
      ...(activeFile ? { activeFile } : {}),
      ...(shell ? { shell } : {}),
      ...(repoMap ? { repoMap } : {}),
      ...(projectMemory ? { projectMemory } : {}),
    }
  }

  /**
   * Get the workspace directory for a session.
   * Checks session directory overrides first (e.g., worktree paths), then falls back to workspace root.
   */
  private getWorkspaceDirectory(sessionId?: string): string {
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

  private getContextDirectory(): string {
    return resolveContextDirectory({
      currentSessionID: this.currentSession?.id,
      contextSessionID: this.contextSessionID,
      sessionDirectories: this.sessionDirectories,
      workspaceDirectory: this.getRootDirectory(),
    })
  }

  private getRootDirectory(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0]!.uri.fsPath
    }
    return process.cwd()
  }

  private trackDirectory(sessionId: string, dir: string) {
    if (path.resolve(dir) === path.resolve(this.getRootDirectory())) {
      this.sessionDirectories.delete(sessionId)
      return
    }
    this.sessionDirectories.set(sessionId, dir)
  }

  private noteFollowup(answers: string[][], sessionID?: string) {
    const dir = this.getWorkspaceDirectory(sessionID)
    this.pendingFollowup = recordFollowup({ answers, dir, now: Date.now() }) ?? null
  }

  private matchesPendingFollowup(session: Session) {
    return matchFollowup({ pending: this.pendingFollowup, dir: session.directory, now: Date.now() })
  }

  private adoptPendingFollowup(session: Session) {
    const now = Date.now()
    const match = this.matchesPendingFollowup(session)
    if (!match) {
      if (
        this.pendingFollowup &&
        !matchFollowup({ pending: this.pendingFollowup, dir: this.pendingFollowup.dir, now })
      ) {
        this.pendingFollowup = null
      }
      return false
    }

    this.pendingFollowup = null
    this.trackDirectory(session.id, session.directory)
    for (const cb of this.followupListeners) cb(session, session.directory)
    this.registerSession(session)
    void this.handleLoadMessages(session.id)
    return true
  }

  private getProjectDirectory(sessionId?: string): string | undefined {
    return resolveProjectDirectory(this.projectDirectory, () => this.getWorkspaceDirectory(sessionId))
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
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

  private get migrationCtx(): MigrationContext {
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

  private getMarketplace(): MarketplaceService {
    if (this.marketplace) return this.marketplace
    this.marketplace = new MarketplaceService()
    return this.marketplace
  }

  // ── Worktree stats polling (sidebar diff badge) ──────────────────

  private startStatsPolling(): void {
    this.statsPoller?.stop()
    this.statsGitOps?.dispose()
    const git = new GitOps({ log: () => {} })
    this.statsGitOps = git
    this.statsPoller = new GitStatsPoller({
      getWorktrees: () => [],
      getWorkspaceRoot: () => getWorkspaceRoot(),
      localDiff: (dir, base) => localDiffSummary(git, dir, base),
      git,
      onStats: () => {},
      onLocalStats: (stats: LocalStats) => {
        const msg = {
          type: "worktreeStatsLoaded" as const,
          files: stats.files,
          additions: stats.additions,
          deletions: stats.deletions,
        }
        this.cachedStats = msg
        this.postMessage(msg)
      },
      log: () => {},
      hiddenIntervalMs: 60000,
    })
    this.statsPoller.setEnabled(true)
    this.statsPoller.setVisible(true)
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

  private disposeSubscriptions(): void {
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

  private disposeDisposables(): void {
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

  private disposeState(): void {
    this.loadMessagesAbort?.abort()
    this.loadMessagesAbort = null
    for (const controller of this.retryAbortControllers.values()) controller.abort()
    this.retryAbortControllers.clear()
    this.confirmations.clear()
    this.followupListeners.length = 0
    this.streams.dispose()
    this.isWebviewReady = false
    this.promptRecoveryQueued = false
    clearNetworkWaits(this.trackedSessionIds)
    this.trackedSessionIds.clear()
    this.syncedChildSessions.clear()
    this.sessionDirectories.clear()
    this.sessionStatusMap.clear()
    this.lastReconciledAt.clear()
  }

  private disposeServices(): void {
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
