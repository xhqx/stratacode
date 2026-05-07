
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

export async function gatherRepoContext(provider: StrataProvider, visibleFiles: string[]): Promise<{ repoMap?: string; projectMemory?: { id: string; title: string; content: string }[] }> {
let repoMap: string | undefined
let projectMemory: { id: string; title: string; content: string }[] | undefined
try {
  const client = provider.connectionService.getClient()
  const config = (provider.cachedConfigMessage as any)?.config

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
