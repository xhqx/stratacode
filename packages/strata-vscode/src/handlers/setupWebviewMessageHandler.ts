
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

export function setupWebviewMessageHandler(provider: StrataProvider, webview: vscode.Webview): void {
provider.webviewMessageDisposable?.dispose()
provider.autocompleteConfigDisposable?.dispose()
provider.settingsConfigDisposable?.dispose()
provider.pluginFeaturesDisposable?.dispose()
provider.pluginConfigSectionsDisposable?.dispose()
provider.pluginConfigDisposable?.dispose()
provider.pluginContributionsDisposable?.dispose()

provider.pluginFeaturesDisposable = pluginRegistry.onDidChangeFeatures((features) => {
  provider.postMessage({ type: "pluginFeaturesLoaded", features })
})
provider.pluginConfigSectionsDisposable = pluginRegistry.onDidChangeConfigSections(() => {
  provider.postMessage(buildPluginConfigLoaded())
})
provider.pluginConfigDisposable = pluginRegistry.onDidChangePluginConfig(({ sectionId, key, value }) => {
  provider.postMessage({
    type: "pluginConfigUpdated",
    sectionId,
    values: { [key]: value },
  })
})
provider.pluginContributionsDisposable = pluginRegistry.onDidChangeContributions((contributions) => {
  provider.postMessage({ type: "pluginContributionsLoaded", contributions })
})

provider.autocompleteConfigDisposable = AutocompleteSettingsManager.getInstance().watchAutocompleteConfig((msg) =>
  provider.postMessage(msg),
)
provider.settingsConfigDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
  if (e.affectsConfiguration("strata-code.new.agents")) {
    provider.fetchAndSendAgents()
  }

  if (e.affectsConfiguration("strata-code.new.features")) {
    provider.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
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
      provider.workerStatusBar?.onConfigChanged()
      provider.fetchAndSendAgents()
    }

    const config = vscode.workspace.getConfiguration("strata-code.new")
    const enabled = isEnabled("workers")
    const review = isEnabled("reviewerWorker")
    const auto_explain = isEnabled("explainerWorker") || config.get<boolean>("workers.autoExplain", false)
    const polling_interval_sec = config.get<number>("workers.pollingIntervalSec", 5)
    const summarizer_prompt = config.get<string>("workers.summarizerPrompt", "")
    const review_prompt = config.get<string>("workers.reviewPrompt", "")
    const explainer_prompt = config.get<string>("workers.explainerPrompt", "")

    if (provider.client) {
      try {
        await provider.client.global.config.update({
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
provider.webviewMessageDisposable = webview.onDidReceiveMessage(async (message) => {
  if (message.type === "requestSetting") {
    Logger.info("StrataProvider", `[DEBUG] requestSetting arrived at onDidReceiveMessage: key=${message.key}`)
  }
  const intercepted = await interceptMessage(message, {
    workspaceDir: (sid) => provider.getWorkspaceDirectory(sid ?? provider.currentSession?.id),
    post: (m) => provider.postMessage(m),
    error: getErrorMessage,
    before: provider.onBeforeMessage,
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

  await routeSuggestionWebviewMessage(provider.questionCtx, message)
  if (await ModelState.handleMessage(message.type, message, provider.client, (msg) => provider.postMessage(msg))) return
  if (
    await AutocompleteSettingsManager.getInstance().routeAutocompleteMessage(message, (msg) =>
      provider.postMessage(msg),
    )
  )
    return
  if (
    await handleSidebarWorktreeMessage(message, {
      post: (msg) => provider.postMessage(msg),
      openAgentManager: () => vscode.commands.executeCommand("strata-code.new.agentManagerOpen"),
      openAdvancedWorktree: () => vscode.commands.executeCommand("strata-code.new.agentManager.advancedWorktree"),
      openChanges: (sessionId?: string) => vscode.commands.executeCommand("strata-code.new.showChanges", sessionId),
      createWorktree: async (baseBranch, branchName) => {
        await provider.createWorktreeHandler?.(baseBranch, branchName)
      },
      continueInWorktree: provider.continueInWorktreeHandler ?? undefined,
    })
  ) {
    return
  }
  // stratacode_change start
  if (
    await handleDocsMessage(
      message,
      (msg: any) => provider.postMessage(msg),
      () => provider.connectionService.getServerConfig(),
      () => provider.getWorkspaceDirectory(provider.currentSession?.id),
    )
  )
    return
  // stratacode_change end
  switch (message.type) {
    case "webviewReady":
      Logger.info("StrataProvider", "✅ webviewReady received")
      provider.isWebviewReady = true
      provider.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
      await provider.syncWebviewState("webviewReady")
      provider.flushPendingReviewComments()
      provider.recoverPendingPrompts()
      provider.readyResolvers.splice(0).forEach((r) => r())
      break

    case "cancelAutoApproveTimer":
      if (provider.autoApproveTimer.isTimerRunningFor(message.requestId)) {
        provider.autoApproveTimer.clearTimer()
      }
      break

    case "executePluginContribution":
      pluginRegistry.executeContribution((message as any).id)
      break
    case "sendMessage": {
      const files = parseMessageFiles(message.files)
      await provider.handleSendMessage(
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
      await provider.handleSendCommand(
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
      provider.cancelRetry(message.sessionID ?? "")
      await provider.handleAbort(message.sessionID)
      break
    case "revertSession":
      provider.handleRevertSession(message.sessionID, message.messageID).catch((e) =>
        Logger.error("StrataProvider", "handleRevertSession failed:", e),
      )
      break
    case "unrevertSession":
      provider.handleUnrevertSession(message.sessionID).catch((e) =>
        Logger.error("StrataProvider", "handleUnrevertSession failed:", e),
      )
      break
    case "permissionResponse":
      await handlePermissionResponse(
        provider.permissionCtx,
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
      await provider.handleCreateSession()
      break
    case "clearSession":
      provider.contextSessionID = provider.currentSession?.id ?? provider.contextSessionID
      provider.currentSession = null
      provider.focusSession()
      break
    case "loadMessages":
      // Don't await: allow parallel loads so rapid session switching
      // isn't blocked by slow responses for earlier sessions.
      void provider.handleLoadMessages(message.sessionID, {
        mode: message.mode,
        before: message.before,
        limit: message.limit,
      })
      break
    case "requestPlanningSettings":
      provider.postMessage({
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
      provider.postMessage({
        type: "planningSettingsLoaded",
        settings: {
          taskView: vscode.workspace.getConfiguration("strata-code.new.planning").get("taskView") ?? true,
          documentDrivenTasks:
            vscode.workspace.getConfiguration("strata-code.new.planning").get("documentDrivenTasks") ?? true,
        },
      })
      break
    case "planning.requestState":
      provider.planningService?.pushState()
      provider.planningService?.pushKanbanTasks()
      break
    case "planning.add":
      provider.planningService?.add(message as any)
      break
    case "planning.update":
      provider.planningService?.update(message.taskId, message.updates)
      break
    case "planning.remove":
      provider.planningService?.remove(message.taskId)
      break
    case "planning.dispatch":
      provider.planningService?.dispatch(message.taskId)
      break
    case "planning.confirm":
      provider.planningService?.confirm(message.taskId)
      break
    case "planning.applyMarkdown":
      provider.planningService?.applyMarkdownTasks()
      break
    case "planning.requestMarkdownPreview":
      provider.planningService?.pushMarkdownPreview()
      break
    case "planning.openPlanFile":
      provider.planningService?.openPlanFile(message.file, message.line)
      break
    case "syncSession":
      provider.handleSyncSession(message.sessionID, message.parentSessionID).catch((e) =>
        Logger.error("StrataProvider", "handleSyncSession failed:", e),
      )
      break
    case "loadSessions":
      provider.handleLoadSessions().catch((e) => Logger.error("StrataProvider", "handleLoadSessions failed:", e))
      break
    case "login": {
      if (!isEnabled("strataAuth")) break
      const attempt = ++provider.loginAttempt
      await handleLogin(provider.authCtx, attempt, () => provider.loginAttempt)
      break
    }
    case "cancelLogin":
      if (!isEnabled("strataAuth")) break
      provider.loginAttempt++
      provider.postMessage({ type: "deviceAuthCancelled" })
      break
    case "logout":
      if (!isEnabled("strataAuth")) break
      await handleLogout(provider.authCtx)
      break
    case "setOrganization":
      if (!isEnabled("strataAuth")) break
      if (typeof message.organizationId === "string" || message.organizationId === null) {
        await handleSetOrganization(provider.authCtx, message.organizationId)
      }
      break
    case "refreshProfile":
      if (!isEnabled("strataAuth")) break
      await handleRefreshProfile(provider.authCtx)
      break
    case "openExternal":
      provider.openExternal(message.url)
      break
    case "openSettingsPanel":
      vscode.commands.executeCommand("strata-code.new.settingsButtonClicked", message.tab)
      break
    case "openVSCodeSettings":
      vscode.commands.executeCommand("workbench.action.openSettings", message.query)
      break
    case "openConfigFile":
      await openConfig(message.scope, message.labels, provider.getProjectDirectory(provider.currentSession?.id))
      break
    case "openMarketplacePanel":
      vscode.commands.executeCommand("strata-code.new.marketplaceButtonClicked", provider.projectDirectory)
      break
    case "openDiffVirtual":
      provider.openDiffVirtual(message.diff, message.initialDiffStyle)
      break
    case "forkSession":
      handleForkSession(provider.forkCtx, message.sessionId, message.messageId).catch((e) =>
        Logger.error("StrataProvider", "handleForkSession failed:", e),
      )
      break

    case "retryConnection":
      Logger.info("StrataProvider", "🔄 Retrying connection...")
      provider.initializeConnection().catch((e) => Logger.error("StrataProvider", "❌ Retry connection failed:", e))
      break
    case "openSubAgentViewer":
      vscode.commands.executeCommand("strata-code.new.openSubAgentViewer", message.sessionID, message.title)
      break
    case "previewImage":
      provider.handlePreviewImage(message.dataUrl, message.filename)
      break
    case "openFile":
      if (message.filePath) {
        provider.handleOpenFile(message.filePath, message.line, message.column)
      }
      break
    case "requestProviders":
      provider.fetchAndSendProviders().catch((e) => Logger.error("StrataProvider", "fetchAndSendProviders failed:", e))
      try {
        sendAcpProviderMeta((msg) => provider.postMessage(msg), provider.cachedConfigMessage)
      } catch (e) {
        Logger.error("StrataProvider", "sendAcpProviderMeta failed:", e)
      }
      break
    case "testAcpConnection":
      testAcpConnection(
        message.key,
        (msg) => provider.postMessage(msg),
        provider.cachedConfigMessage,
        provider.getWorkspaceDirectory()
      ).catch((e: unknown) => Logger.error("StrataProvider", "testAcpConnection failed:", e))
      break
    case "connectProvider":
    case "authorizeProviderOAuth":
    case "completeProviderOAuth":
    case "disconnectProvider":
    case "saveCustomProvider":
      await provider.handleProviderAction(message)
      break
    case "fetchCustomProviderModels":
      provider.handleFetchCustomProviderModels(message).catch((e) =>
        Logger.error("StrataProvider", "fetchCustomProviderModels failed:", e),
      )
      break
    case "compact":
      await provider.handleCompact(message.sessionID, message.providerID, message.modelID)
      break
    case "requestAgents":
      provider.fetchAndSendAgents().catch((e) => Logger.error("StrataProvider", "fetchAndSendAgents failed:", e))
      break
    case "requestSkills":
      provider.fetchAndSendSkills().catch((e) => Logger.error("StrataProvider", "fetchAndSendSkills failed:", e))
      break
    case "requestCommands":
      provider.fetchAndSendCommands().catch((e) => Logger.error("StrataProvider", "fetchAndSendCommands failed:", e))
      break
    case "removeSkill":
      provider.removeSkillViaCli(message.location).catch((e: unknown) =>
        Logger.error("StrataProvider", "removeSkill failed:", e),
      )
      break
    case "removeMode":
      provider.handleRemoveMode(message.name).catch((e) =>
        Logger.error("StrataProvider", "handleRemoveMode failed:", e),
      )
      break
    case "removeMcp":
      provider.handleRemoveMcp(message.name).catch((e) => Logger.error("StrataProvider", "handleRemoveMcp failed:", e))
      break
    case "requestMcpStatus":
      provider.fetchAndSendMcpStatus().catch((e) => Logger.error("StrataProvider", "fetchAndSendMcpStatus failed:", e))
      break
    case "connectMcp":
      provider.handleConnectMcp(message.name).catch((e) =>
        Logger.error("StrataProvider", "handleConnectMcp failed:", e),
      )
      break
    case "disconnectMcp":
      provider.handleDisconnectMcp(message.name).catch((e) =>
        Logger.error("StrataProvider", "handleDisconnectMcp failed:", e),
      )
      break

    case "questionReply":
      provider.noteFollowup(message.answers, message.sessionID)
      if (!(await handleQuestionReply(provider.questionCtx, message.requestID, message.answers, message.sessionID))) {
        provider.pendingFollowup = null
      }
      break
    case "questionReject":
      provider.pendingFollowup = null
      await handleQuestionReject(provider.questionCtx, message.requestID, message.sessionID)
      break
    case "requestConfig":
      provider.fetchAndSendConfig().catch((e) => Logger.error("StrataProvider", "fetchAndSendConfig failed:", e))
      break
    case "requestGlobalConfig":
      provider.fetchAndSendGlobalConfig().catch((e) =>
        Logger.error("StrataProvider", "fetchAndSendGlobalConfig failed:", e),
      )
      break
    case "requestIndexingStatus":
      provider.fetchAndSendIndexingStatus().catch((e) =>
        Logger.error("StrataProvider", "fetchAndSendIndexingStatus failed:", e),
      )
      break
    case "updateConfig":
      await provider.handleUpdateConfig(message.config)
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
      provider.postMessage(buildPluginConfigLoaded())
      break
    }
    case "savePluginConfig": {
      await handleSavePluginConfig(message.sectionId, message.changes, (msg) => provider.postMessage(msg))
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
      provider.connectionService.notifyLanguageChanged(message.locale as string)
      break
    case "requestChatCompletion": {
      if (!provider.chatAutocomplete) {
        provider.chatAutocomplete = new ChatTextAreaAutocomplete(provider.connectionService)
      }
      void provider.chatAutocomplete.handle(
        { type: "requestChatCompletion", text: message.text, requestId: message.requestId },
        {
          postMessage: (msg: { type: "chatCompletionResult"; text: string; requestId: string }) =>
            provider.postMessage(msg),
        },
      )
      break
    }
    case "requestFileSearch":
      await handleFileSearch({
        client: provider.client,
        message,
        current: provider.currentSession?.id,
        context: provider.contextSessionID,
        dir: (id) => provider.getWorkspaceDirectory(id),
        open: (dir) => provider.getOpenTabPaths(dir),
        post: (msg) => provider.postMessage(msg),
      })
      break
    case "requestTerminalContext":
      void provider.handleTerminalContext(message.requestId)
      break
    case "chatCompletionAccepted":
      provider.chatAutocomplete?.telemetry.captureAcceptSuggestion(message.suggestionLength)
      break
    case "toggleRemote":
    case "setRemoteEnabled":
    case "requestRemoteStatus":
      provider.remoteService
        ?.handleMessage(message.type, message.enabled)
        .then((s) => {
          if (s) provider.sendRemoteStatus()
        })
        .catch((err) => Logger.error("StrataProvider", "remote message failed:", err))
      break
    case "deleteSession":
      await provider.handleDeleteSession(message.sessionID)
      break
    case "renameSession":
      await provider.handleRenameSession(message.sessionID, message.title)
      break
    case "updateSetting":
      await provider.handleUpdateSetting(message.key, message.value)
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
      provider.sendBrowserSettings()
      break
    case "requestExtensionFeatures":
      provider.postMessage({ type: "extensionFeaturesLoaded", features: readAllFeatures() })
      break
    case "requestClaudeCompatSetting":
      provider.sendClaudeCompatSetting()
      break
    case "requestNotificationSettings":
      provider.sendNotificationSettings()
      break
    case "requestSetting":
      provider.handleRequestSetting(message.key)
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
        void provider.handleDiffStartThread(
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
      void provider.handleDiffExplainAll(message)
      break
    case "diffViewer.replyToThread":
      if (typeof message.threadId === "string" && typeof message.text === "string") {
        void provider.handleDiffReplyToThread(message.threadId, message.text)
      }
      break

    case "requestTimelineSetting":
      provider.sendTimelineSetting()
      break
    case "requestNotifications":
      provider.fetchAndSendNotifications().catch((e) =>
        Logger.error("StrataProvider", "fetchAndSendNotifications failed:", e),
      )
      break
    case "requestCloudSessions":
      if (!isEnabled("cloudSessions")) break
      await handleRequestCloudSessions(provider.cloudSessionCtx, message)
      break
    case "requestGitRemoteUrl":
      void provider.getGitRemoteUrl().then((url) => {
        provider.postMessage({ type: "gitRemoteUrlLoaded", gitUrl: url ?? null })
      })
      break
    case "requestCloudSessionData":
      if (!isEnabled("cloudSessions")) break
      void handleRequestCloudSessionData(provider.cloudSessionCtx, message.sessionId)
      break
    case "importAndSend": {
      if (!isEnabled("cloudSessions")) break
      const files = parseMessageFiles(message.files)
      void handleImportAndSend(
        provider.cloudSessionCtx,
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
      await provider.handleDismissNotification(message.notificationId)
      break
    case "resetAllSettings":
      await provider.handleResetAllSettings()
      break
    case "telemetry":
      TelemetryProxy.capture(message.event, message.properties)
      break
    case "persistVariant": {
      const stored = provider.extensionContext?.globalState.get<Record<string, string>>("variantSelections") ?? {}
      stored[message.key] = message.value
      await provider.extensionContext?.globalState.update("variantSelections", stored)
      break
    }
    case "requestVariants": {
      const variants = provider.extensionContext?.globalState.get<Record<string, string>>("variantSelections") ?? {}
      provider.postMessage({ type: "variantsLoaded", variants })
      break
    }
    case "persistRecents":
      await provider.extensionContext?.globalState.update("recentModels", validateRecents(message.recents))
      break
    case "requestRecents": {
      const recents = validateRecents(provider.extensionContext?.globalState.get("recentModels"))
      provider.postMessage({ type: "recentsLoaded", recents })
      break
    }
    case "toggleFavorite": {
      const current = validateFavorites(provider.extensionContext?.globalState.get("favoriteModels"))
      const key = `${message.providerID}/${message.modelID}`
      const exists = current.some((f) => `${f.providerID}/${f.modelID}` === key)
      const favorites =
        message.action === "add" && !exists
          ? [...current, { providerID: message.providerID, modelID: message.modelID }]
          : message.action === "remove" && exists
            ? current.filter((f) => `${f.providerID}/${f.modelID}` !== key)
            : current
      await provider.extensionContext?.globalState.update("favoriteModels", favorites)
      provider.connectionService.notifyFavoritesChanged(favorites)
      break
    }
    case "requestFavorites": {
      const favorites = validateFavorites(provider.extensionContext?.globalState.get("favoriteModels"))
      provider.postMessage({ type: "favoritesLoaded", favorites })
      break
    }
    case "saveKanbanTasks":
      await provider.extensionContext?.globalState.update("kanbanTasks", (message as any).tasks)
      break
    case "requestKanbanTasks": {
      const tasks = provider.extensionContext?.globalState.get<any>("kanbanTasks") ?? []
      provider.postMessage({ type: "kanbanTasksLoaded", tasks })
      break
    }
    case "requestRepoMapStats": {
      const sdkClient = provider.connectionService.getClient()
      if (sdkClient) {
        sdkClient.repoMap
          .generate({ budget: 4096 })
          .then((res) => {
            if (res.data) {
              provider.postMessage({ type: "repoMapStatsLoaded", stats: res.data.stats })
            }
          })
          .catch((e) => {
            Logger.error("StrataProvider", "Failed to fetch repo map stats", e)
          })
      }
      break
    }
    case "invalidateRepoMap": {
      const sdkClient = provider.connectionService.getClient()
      if (sdkClient) {
        sdkClient.repoMap
          .invalidate({})
          .then(() => {
            // Re-fetch stats after invalidation
            return sdkClient.repoMap.generate({ budget: 4096 })
          })
          .then((res) => {
            if (res && res.data) {
              provider.postMessage({ type: "repoMapStatsLoaded", stats: res.data.stats })
            }
          })
          .catch((e) => {
            Logger.error("StrataProvider", "Failed to invalidate repo map", e)
          })
      }
      break
    }
    case "requestWorkerRuntimeStatus": {
      provider.workerStatusBar?.postRuntimeStatus()
      break
    }

    // legacy-migration start
    case "requestLegacyMigrationData":
      void handleRequestLegacyMigrationData(provider.migrationCtx)
      break
    case "startLegacyMigration":
      void handleStartLegacyMigration(provider.migrationCtx, message.selections)
      break
    case "skipLegacyMigration":
      void handleSkipLegacyMigration(provider.migrationCtx)
      break
    case "clearLegacyData":
      void handleClearLegacyData(provider.migrationCtx)
      break
    case "finalizeLegacyMigration":
      void handleFinalizeLegacyMigration(provider.migrationCtx)
      break
    // legacy-migration end
    case "enhancePrompt": {
      const sdkClient = provider.client
      if (!sdkClient) {
        provider.postMessage({
          type: "enhancePromptError",
          error: "Not connected to CLI backend",
          requestId: message.requestId,
        })
        break
      }
      void sdkClient.enhancePrompt
        .enhance({ text: message.text }, { throwOnError: true })
        .then(({ data }) => {
          provider.postMessage({ type: "enhancePromptResult", text: data.text, requestId: message.requestId })
        })
        .catch((err: unknown) => {
          const msg = getErrorMessage(err) || "Failed to enhance prompt"
          Logger.error("StrataProvider", "Failed to enhance prompt:", err)
          vscode.window.showErrorMessage(`Enhance prompt failed: ${msg}`)
          provider.postMessage({
            type: "enhancePromptError",
            error: msg,
            requestId: message.requestId,
          })
        })
      break
    }
    // stratacode_change start
    case "requestTaskSuggestions": {
      const sdkClient = provider.client
      if (!sdkClient) break
      const dir = provider.getProjectDirectory(provider.currentSession?.id)
      void sdkClient.suggestTasks
        .generate({ body_directory: dir }, { throwOnError: true })
        .then(({ data }) => {
          provider.postMessage({
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
      const sdkClient = provider.client
      if (!sdkClient) break
      const dir = provider.getProjectDirectory(provider.currentSession?.id)
      void sdkClient.chatAutocomplete
        .complete({ text: message.text, body_directory: dir }, { throwOnError: true })
        .then(({ data }) => {
          provider.postMessage({ type: "agentChatCompletionResult", text: data.text, requestId: message.requestId })
        })
        .catch((err: unknown) => {
          Logger.error("StrataProvider", "chatAutocomplete failed:", err)
        })
      break
    }
    // stratacode_change end

    case "fetchMarketplaceData": {
      const workspace = provider.getProjectDirectory(provider.currentSession?.id)
      const mp = provider.getMarketplace()
      // Fetch skills from CLI backend (authoritative source) so the
      // marketplace doesn't need to duplicate the CLI's skill scanning.
      const skills = await provider.fetchCliSkills()
      const data = await mp.fetchData(workspace, skills)
      provider.postMessage({ type: "marketplaceData", ...data })
      break
    }
    case "filterMarketplaceItems": {
      // Client-side filtering — no server action needed
      break
    }
    case "installMarketplaceItem": {
      const workspace = provider.getProjectDirectory(provider.currentSession?.id)
      const scope = message.mpInstallOptions?.target ?? "project"
      const result = await provider.getMarketplace().install(message.mpItem, message.mpInstallOptions, workspace)
      if (result.success) {
        await provider.invalidateAfterMarketplaceChange(scope)
      }
      provider.postMessage({
        type: "marketplaceInstallResult",
        success: result.success,
        slug: result.slug,
        error: result.error,
      })
      break
    }
    case "removeInstalledMarketplaceItem": {
      const scope = message.mpInstallOptions?.target ?? "project"
      const result = await provider.removeMarketplaceItem(message.mpItem, scope)
      provider.postMessage({
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
