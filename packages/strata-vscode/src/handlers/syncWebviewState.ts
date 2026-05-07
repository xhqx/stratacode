
import * as path from "path"
import * as vscode from "vscode"
import { buildPreviewPath, getPreviewCommand, getPreviewDir, parseImage, trimEntries } from "../image-preview"
import { isAbsolutePath } from "../path-utils"
import type {
  StrataClient,
  Session,
  SessionStatus,
  Event,
  TextPartInput,
  FilePartInput,
  Config,
} from "@stratacode/sdk/v2/client"
import { type StrataConnectionService, ServerStartupError } from "../services/cli-backend"
import { pluginRegistry } from "../plugin-api"
import {
  buildPluginConfigLoaded,
  handleSavePluginConfig,
  applyPluginHooks,
  markPending,
  checkCompletion,
} from "../stratacode/plugin-config-handlers"
import type { EditorContext, IndexingStatus } from "../services/cli-backend/types"
import { FileIgnoreController } from "../services/autocomplete/shims/FileIgnoreController"
import { ChatTextAreaAutocomplete } from "../services/autocomplete/chat-autocomplete/ChatTextAreaAutocomplete"
import { buildWebviewHtml } from "../utils"
import { TelemetryProxy, type TelemetryPropertiesProvider } from "../services/telemetry"
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
} from "../strata-provider-utils"
import { GitOps } from "../agent-manager/GitOps"
import { GitStatsPoller, type LocalStats } from "../agent-manager/GitStatsPoller"
import { buildIndexedPatches, parseExplainResponse, shouldPreSkip, buildExplainPrompt } from "../explain-skip"
import type { ReviewThread } from "../DiffViewerProvider"
import { diffSummary as localDiffSummary, batchPatches, ancestor as localAncestor } from "../agent-manager/local-diff"
import { getWorkspaceRoot } from "../review-utils"
import { MarketplaceService, type MarketplaceItem, type RemoveResult } from "../services/marketplace"
import type { RemoteStatusService } from "../services/RemoteStatusService"
import { resolveProjectDirectory } from "../project-directory"
import { getBusySessionCount, seedSessionStatuses } from "../session-status"
import { retry } from "../services/cli-backend/retry"
import { slimPart, slimParts } from "../strata-provider/slim-metadata"
import { handleSidebarWorktreeMessage } from "../strata-provider/sidebar-worktree"
import { parseMessageFiles, type MessageFile } from "../strata-provider/message-files"
import { readAll as readAllFeatures } from "../stratacode/feature-gate"
import { handleFileSearch } from "../strata-provider/file-search"
import { getTerminalContents } from "../services/terminal/context"
import { disposeGitChangesTarget } from "../strata-provider/git-changes-target"
import { interceptMessage } from "../strata-provider/git-changes-request"
import { matchFollowup, recordFollowup, type Followup } from "../strata-provider/followup-session"
import { clearCommandsCache, loadCommands } from "../strata-provider/commands"
import { fetchMessagePage, MESSAGE_PAGE_LIMIT } from "../strata-provider/message-page"
import { childID } from "../strata-provider/task-session"
import { handleNetworkEvent, clearNetworkWaits } from "../strata-provider/network"
import { abortSession } from "../strata-provider/abort"
import { AutocompleteSettingsManager } from "../services/autocomplete/AutocompleteSettingsManager"
import * as ModelState from "../strata-provider/model-state"
import { handleForkSession } from "../strata-provider/fork-session"
import { openConfig } from "../strata-provider/open-config"
import { retryable, backoff, MAX_RETRIES } from "../util/retry"
import { hasGit } from "../strata-provider/git-status"
import {
  checkAndShowMigrationWizard,
  handleRequestLegacyMigrationData,
  handleStartLegacyMigration,
  handleFinalizeLegacyMigration,
  handleSkipLegacyMigration,
  handleClearLegacyData,
  type MigrationContext,
} from "../strata-provider/handlers/migration"
import {
  handleLogin,
  handleLogout,
  handleSetOrganization,
  handleRefreshProfile,
  type AuthContext,
} from "../strata-provider/handlers/auth"
import {
  handleRequestCloudSessions,
  handleRequestCloudSessionData,
  handleImportAndSend,
  type CloudSessionContext,
} from "../strata-provider/handlers/cloud-session"
import {
  handlePermissionResponse,
  fetchAndSendPendingPermissions,
  type PermissionContext,
} from "../strata-provider/handlers/permission-handler"
import {
  handleQuestionReply,
  handleQuestionReject,
  fetchAndSendPendingQuestions,
} from "../strata-provider/handlers/question"
import { fetchAndSendPendingSuggestions, routeSuggestionWebviewMessage } from "../strata-provider/handlers/suggestion"
import { sendAcpProviderMeta, testAcpConnection } from "../stratacode/acp-test"
import { handleDocsMessage } from "../stratacode/features/docs"
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
} from "../provider-actions"
import { fetchOpenAIModels, FetchModelsError } from "../shared/fetch-models"
import type { Agent } from "@stratacode/sdk/v2/client"
import { configFeatures } from "../features"
import { AutoApproveTimer } from "../strata-provider/auto-approve-timer"
import { PlanningService } from "../planning"
import { GitWatcher } from "../services/memory/GitWatcher"
import { Logger } from "../stratacode/logger"
import { WorkerStatusBar } from "../services/worker/WorkerStatusBar"
import { WorkerWatcher } from "../services/worker/WorkerWatcher"
import { isEnabled } from "../stratacode/feature-gate"
import { StrataProvider, mapAgent } from "../StrataProvider";

export async function syncWebviewState(provider: StrataProvider, reason: string): Promise<void> {
const serverInfo = provider.connectionService.getServerInfo()
Logger.info("StrataProvider", "🔄 syncWebviewState()", {
  reason,
  isWebviewReady: provider.isWebviewReady,
  connectionState: provider.connectionState,
  hasClient: !!provider.client,
  hasServerInfo: !!serverInfo,
})

if (!provider.isWebviewReady) {
  Logger.info("StrataProvider", "⏭️ syncWebviewState skipped (webview not ready)")
  return
}

// Always push connection state first so the UI can render appropriately.
provider.postMessage({
  type: "connectionState",
  state: provider.connectionState,
})

// Re-send ready so the webview can recover after refresh.
if (serverInfo) {
  const langConfig = vscode.workspace.getConfiguration("strata-code.new")
  provider.postMessage({
    type: "ready",
    serverInfo,
    extensionVersion: provider.extensionVersion,
    vscodeLanguage: vscode.env.language,
    languageOverride: langConfig.get<string>("language"),
    workspaceDirectory: provider.getProjectDirectory(provider.currentSession?.id),
  })
}

// Push plugin UI contributions
provider.postMessage({
  type: "pluginContributionsLoaded",
  contributions: pluginRegistry.getRenderableContributions(),
})

// Push plugin config sections
provider.postMessage(buildPluginConfigLoaded())

// Push plugin features
provider.postMessage({
  type: "pluginFeaturesLoaded",
  features: pluginRegistry.getRenderablePluginFeatures(),
})

// Always attempt to fetch+push profile when connected.
// Profile returns 401 when user isn't logged into Strata Gateway — that's expected.
// Use fire-and-forget (no throwOnError) to match old getProfile() which returned null on error.
if (provider.connectionState === "connected" && provider.client) {
  if (isEnabled("strataAuth")) {
    Logger.info("StrataProvider", "👤 syncWebviewState fetching profile...")
    const profileResult = await retry(() => provider.client!.strata.profile())
    const profileData = profileResult.data ?? null
    Logger.info("StrataProvider", "👤 syncWebviewState profile:", profileData ? "received" : "null")
    provider.postMessage({
      type: "profileData",
      data: profileData,
    })
  }

  // Re-send cached worktree stats and git status after webview reload.
  if (provider.cachedStats) provider.postMessage(provider.cachedStats)
  provider.postMessage({ type: "gitStatus", repo: provider.cachedGitRepo })

  // Seed session status map so the Settings panel knows about already-running sessions.
  // Must run after webview is ready (postMessage is a no-op before that).
  // Only reconcile (reset missing busy→idle) when the map is empty, i.e.
  // on the very first seed before any real-time SSE events have arrived.
  // On SSE reconnects or webview recreations the live SSE data is
  // authoritative and reconciliation risks race-resetting busy sessions.
  const reconcile = provider.sessionStatusMap.size === 0
  void provider.seedSessionStatusMap(reconcile)

  provider.sendRemoteStatus()
}

// legacy-migration start
// Show the migration wizard once the CLI connection is established.
// Three triggers cover all timing scenarios:
//   "webviewReady" + connected — webview loaded after SSE was already up
//   "sse-connected"            — SSE connected after webview was ready
//   "initializeConnection"     — sidebar path where connect() resolves before
//                                onStateChange is subscribed, so sse-connected never fires
if (provider.connectionState === "connected") {
  void checkAndShowMigrationWizard(provider.migrationCtx)
}
}
