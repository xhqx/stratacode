
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

export async function handleDiffExplainAll(provider: StrataProvider, message: any): Promise<void> {
const worktreeId = message.worktreeId as string | undefined
const root = provider.getProjectDirectory(provider.currentSession?.id)
if (!root) {
  provider.postMessage({ type: "diffViewer.explainResult", error: "No workspace root found.", done: true })
  return
}
const targetDirectory = worktreeId ? path.join(path.dirname(root), worktreeId) : root

try {
  await vscode.workspace.fs.stat(vscode.Uri.file(targetDirectory))
} catch {
  provider.postMessage({
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
      provider.postMessage({
        type: "diffViewer.explainResult",
        threads: [],
        summary: "No complex changes to explain.",
        done: true,
      })
      return
    }

    const client = provider.connectionService.getClient()

    if (!provider.diffExplainSession) {
      const { data } = await client.session.create({ directory: targetDirectory }, { throwOnError: true })
      provider.diffExplainSession = data.id
      provider.connectionService.hideSession(data.id)
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

    await provider.processExplanationBatches(client, targetDirectory, validDiffs, sessionContext)
  } finally {
    gitOps.dispose()
  }
} catch (err) {
  Logger.error("StrataProvider", "diffViewer.explainAll failed:", err)
  provider.postMessage({ type: "diffViewer.explainResult", error: String(err), done: true })
}
}
