
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

export async function doInitializeConnection(provider: StrataProvider): Promise<void> {
Logger.info("StrataProvider", "🔧 Starting initializeConnection...")

provider.connectionState = "connecting"
provider.postMessage({ type: "connectionState", state: "connecting" })

// Clean up any existing subscriptions (e.g., sidebar re-shown)
provider.unsubscribeEvent?.()
provider.unsubscribeState?.()
provider.unsubscribeNotificationDismiss?.()
provider.unsubscribeLanguageChange?.()
provider.unsubscribeProfileChange?.()
provider.unsubscribeFavoritesChange?.()
provider.unsubscribeClearPendingPrompts?.()
provider.unsubscribeDirectoryProvider?.()

try {
  const workspaceDir = provider.getWorkspaceDirectory()

  // Connect the shared service (no-op if already connected)
  await provider.connectionService.connect(workspaceDir)

  // Subscribe to SSE events for this webview (filtered by tracked sessions)
  provider.unsubscribeEvent = provider.connectionService.onEventFiltered(
    (event) => {
      // Remote status events are global and should always pass through
      if (event.type === "strata-sessions.remote-status-changed") return true
      const sessionId = provider.connectionService.resolveEventSessionId(event)

      // message.part.updated and message.part.delta are always session-scoped; drop if session unknown.
      if (!sessionId) {
        return event.type !== "message.part.updated" && event.type !== "message.part.delta"
      }

      if (event.type === "session.created" && provider.matchesPendingFollowup(event.properties.info)) {
        return true
      }

      // session.status must always pass through — even for sessions not tracked by this
      // StrataProvider instance. The Settings panel is a separate provider with no tracked
      // sessions, but it needs session.status to populate sessionStatusMap and allStatusMap
      // for the busy-session warning on Save.
      if (event.type === "session.status") return true

      return provider.trackedSessionIds.has(sessionId)
    },
    (event) => {
      provider.handleEvent(event)
    },
  )

  // Subscribe to connection state changes
  provider.unsubscribeState = provider.connectionService.onStateChange(async (state) => {
    provider.connectionState = state
    provider.postMessage({ type: "connectionState", state })

    if (state === "connected") {
      // Fire config warnings independently so a failure in the
      // sequential await chain doesn't prevent warnings from being shown
      void provider.checkConfigWarnings("state")
      try {
        // Profile fetch is best-effort — returns 401 when user isn't logged into gateway.
        const sdkClient = provider.client
        if (sdkClient && isEnabled("strataAuth")) {
          const profileResult = await sdkClient.strata.profile()
          provider.postMessage({ type: "profileData", data: profileResult.data ?? null })
        }
        await provider.syncWebviewState("sse-connected")
        await provider.flushPendingSessionRefresh("sse-connected")
        provider.recoverPendingPrompts()
      } catch (error) {
        Logger.error("StrataProvider", "❌ Failed during connected state handling:", error)
        provider.postMessage({
          type: "error",
          message: getErrorMessage(error) || "Failed to sync after connecting",
        })
      }
    }
  })

  // Subscribe to notification dismiss broadcast from other StrataProvider instances
  provider.unsubscribeNotificationDismiss = provider.connectionService.onNotificationDismissed(() => {
    provider.fetchAndSendNotifications()
  })

  // Subscribe to language change broadcast from other StrataProvider instances
  provider.unsubscribeLanguageChange = provider.connectionService.onLanguageChanged((locale) => {
    provider.postMessage({ type: "languageChanged", locale })
  })

  // Subscribe to profile change broadcast from other StrataProvider instances
  provider.unsubscribeProfileChange = provider.connectionService.onProfileChanged((data) => {
    provider.postMessage({ type: "profileData", data })
  })

  // Subscribe to favorites change broadcast from other StrataProvider instances
  provider.unsubscribeFavoritesChange = provider.connectionService.onFavoritesChanged((favorites) => {
    provider.postMessage({ type: "favoritesLoaded", favorites })
  })

  // legacy-migration start
  // Subscribe to migration-complete broadcast from any StrataProvider instance
  provider.unsubscribeMigrationComplete = provider.connectionService.onMigrationComplete(() => {
    provider.postMessage({ type: "migrationState", needed: false })
  })
  // legacy-migration end

  // Subscribe to clear-pending-prompts broadcast (fired after config save drains prompts)
  provider.unsubscribeClearPendingPrompts = provider.connectionService.onClearPendingPrompts(() => {
    provider.postMessage({ type: "clearPendingPrompts" })
  })

  // Register this provider's directories so drainPendingPrompts() covers all instances
  provider.unsubscribeDirectoryProvider = provider.connectionService.registerDirectoryProvider(() => {
    return [provider.getWorkspaceDirectory(), ...provider.sessionDirectories.values()]
  })

  // Get current state and push to webview
  const serverInfo = provider.connectionService.getServerInfo()
  provider.connectionState = provider.connectionService.getConnectionState()

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

  provider.postMessage({ type: "connectionState", state: provider.connectionState })

  // connect() can resolve after SSE reaches "connected" but before this
  // provider subscribes to onStateChange(). In that case the initial
  // connected callback is missed, so run the warning check here too.
  if (provider.connectionState === "connected") {
    void provider.checkConfigWarnings("init")
  }

  await provider.syncWebviewState("initializeConnection")
  await provider.flushPendingSessionRefresh("initializeConnection")
  provider.recoverPendingPrompts()

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
    await provider.client?.global.config.update({
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
    provider.fetchAndSendProviders(),
    provider.fetchAndSendAgents(),
    provider.fetchAndSendSkills(),
    provider.fetchAndSendCommands(),
    provider.fetchAndSendConfig(),
    provider.fetchAndSendIndexingStatus(),
    provider.fetchAndSendNotifications(),
    provider.seedSessionStatusMap(),
  ])
  provider.cachedGitRepo = await hasGit(provider.client!, provider.getWorkspaceDirectory())
  provider.postMessage({ type: "gitStatus", repo: provider.cachedGitRepo })
  provider.sendNotificationSettings()
  provider.sendTimelineSetting()
  provider.postMessage({ type: "extensionDataReady" })

  if (provider.cachedGitRepo) provider.startStatsPolling()

  Logger.info("StrataProvider", "✅ initializeConnection completed successfully")
} catch (error) {
  Logger.error("StrataProvider", "❌ Failed to initialize connection:", error)
  provider.connectionState = "error"
  provider.postMessage({
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
