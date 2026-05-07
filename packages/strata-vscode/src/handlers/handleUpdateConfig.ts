
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

export async function handleUpdateConfig(provider: StrataProvider, partial: Partial<Config>): Promise<void> {
if (!provider.client || provider.connectionState !== "connected") {
  provider.postMessage({ type: "configUpdateFailed", message: "Not connected to CLI backend" })
  return
}

const refreshProviders =
  partial.provider !== undefined ||
  partial.disabled_providers !== undefined ||
  partial.enabled_providers !== undefined

// Guard against fetchAndSendConfig pushing stale data while the write is in flight.
provider.pending++

// Phase 1: write. Errors here = real save failures the user can fix + retry.
try {
  await provider.connectionService.drainPendingPrompts()
  await provider.client.global.config.update({ config: partial }, { throwOnError: true })
} catch (error) {
  Logger.error("StrataProvider", "Failed to update config:", error)
  provider.postMessage({
    type: "configUpdateFailed",
    message: getErrorMessage(error) || "Failed to update config",
    details: getConfigErrorDetails(error),
  })
  provider.pending--
  return
}

// Phase 2: refresh. Config is already on disk — post-write errors are
// transient, so send an optimistic configUpdated to clear the webview's
// saving/draft state. SSE global.config.updated pushes the real data next.
try {
  const dir = provider.getWorkspaceDirectory()
  const { data: merged } = await retry(() => provider.client!.config.get({ directory: dir }, { throwOnError: true }))
  provider.cachedConfigMessage = { type: "configLoaded", config: merged, features: configFeatures(merged) }
  provider.postMessage({ type: "configUpdated", config: merged, features: configFeatures(merged) })
  if (refreshProviders) await provider.fetchAndSendProviders()
  if (partial.command !== undefined) {
    provider.clearCommandsCache()
    await provider.fetchAndSendCommands()
  }
  if (partial.skills !== undefined) {
    provider.cachedSkillsMessage = null
    provider.clearCommandsCache()
    await Promise.all([provider.fetchAndSendSkills(), provider.fetchAndSendCommands()])
  }
} catch (error) {
  Logger.error("StrataProvider", "Config write succeeded but post-write refresh failed:", error)
  const cached = (provider.cachedConfigMessage as { config?: unknown } | null)?.config
  const features = (provider.cachedConfigMessage as { features?: unknown } | null)?.features
  const optimistic =
    cached && typeof cached === "object" ? { ...(cached as Record<string, unknown>), ...partial } : partial
  provider.postMessage({
    type: "configUpdated",
    config: optimistic,
    features: features ?? configFeatures(optimistic as Config),
  })
} finally {
  provider.pending--
}
}
