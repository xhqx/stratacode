
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
import { syncWebviewState } from "../handlers/syncWebviewState";
import { doInitializeConnection } from "../handlers/doInitializeConnection";
import { handleSyncSession } from "../handlers/handleSyncSession";
import { fetchAndSendProviders } from "../handlers/fetchAndSendProviders";
import { handleUpdateConfig } from "../handlers/handleUpdateConfig";
import { withRetry } from "../handlers/withRetry";
import { handleSendMessage } from "../handlers/handleSendMessage";
import { handleSendCommand } from "../handlers/handleSendCommand";
import { handleDiffStartThread } from "../handlers/handleDiffStartThread";
import { handleDiffReplyToThread } from "../handlers/handleDiffReplyToThread";
import { processExplanationBatches } from "../handlers/processExplanationBatches";
import { handleDiffExplainAll } from "../handlers/handleDiffExplainAll";
import { StrataProvider, mapAgent } from "../StrataProvider";

export async function fetchAndSendNotifications(provider: StrataProvider): Promise<void> {
if (!provider.client) {
  if (provider.cachedNotificationsMessage) {
    // Merge the latest dismissed IDs from globalState into the cached
    // message so that dismissals persisted while offline are honoured.
    const persisted = provider.extensionContext?.globalState.get<string[]>("strata.dismissedNotificationIds", []) ?? []
    if (persisted.length > 0) {
      const cached = provider.cachedNotificationsMessage as {
        type: string
        notifications: unknown[]
        dismissedIds: string[]
      }
      const merged = Array.from(new Set([...cached.dismissedIds, ...persisted]))
      provider.cachedNotificationsMessage = { ...cached, dismissedIds: merged }
    }
    provider.postMessage(provider.cachedNotificationsMessage)
  }
  return
}

try {
  const { data: all } = await retry(() => provider.client!.strata.notifications(undefined, { throwOnError: true }))
  const notifications = all.filter((n) => !n.showIn || n.showIn.includes("extension"))
  const existing = provider.extensionContext?.globalState.get<string[]>("strata.dismissedNotificationIds", []) ?? []
  const active = new Set(notifications.map((n) => n.id))
  // Only prune stale dismissed IDs when we have a non-empty notification
  // list. An empty list may mean the API returned nothing due to being
  // unauthenticated (e.g. right after logout), not that all notifications
  // are gone — pruning in that case would wipe the persisted dismissals.
  const dismissedIds = notifications.length > 0 ? existing.filter((id) => active.has(id)) : existing
  if (dismissedIds.length !== existing.length) {
    await provider.extensionContext?.globalState.update("strata.dismissedNotificationIds", dismissedIds)
  }
  const message = { type: "notificationsLoaded", notifications, dismissedIds }
  provider.cachedNotificationsMessage = message
  provider.postMessage(message)
} catch (error) {
  Logger.error("StrataProvider", "Failed to fetch notifications:", error)
}
}
