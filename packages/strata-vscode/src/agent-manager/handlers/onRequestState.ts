
import * as fs from "fs"
import * as path from "path"
import type { StrataClient, Session } from "@stratacode/sdk/v2/client"
import type { StrataConnectionService } from "../../services/cli-backend"
import { getErrorMessage } from "../../strata-provider-utils"
import { resolveLocalDiffTarget } from "../../review-utils"
import { isAbsolutePath } from "../../path-utils"
import { WorktreeManager, type CreateWorktreeResult } from "../WorktreeManager"
import { remoteRef, WorktreeStateManager } from "../WorktreeStateManager"
import { handleSection } from "../section-handler"
import { type ChainResult, handled, unhandled } from "../chain-result"
import { chooseBaseBranch, normalizeBaseBranch } from "../base-branch"
import { GitStatsPoller, type LocalStats, type WorktreePresenceResult, type WorktreeStats } from "../GitStatsPoller"
import { PRStatusBridge } from "../pr-status-bridge"
import { GitOps } from "../GitOps"
import { versionedName } from "../branch-name"
import { classifyWorktreeError } from "../git-import"
import { SetupScriptService } from "../SetupScriptService"
import { SetupScriptRunner } from "../SetupScriptRunner"
import { copyEnvFiles } from "../env-copy"
import { SessionTerminalManager } from "../SessionTerminalManager"
import { createTerminalHost } from "../terminal-host"
import { TerminalRouter } from "../terminal-routing"
import { executeVscodeTask } from "../task-runner"
import { startVscodeRunTask } from "../run/task"
import { RunController } from "../run/controller"
import { handleRunMessage } from "../run/message"
import { forkSession } from "../fork-session"
import { continueInWorktree } from "../continue-in-worktree"
import { WorktreeDiffController } from "../worktree-diff-controller"
import { WorktreeImporter } from "../worktree-importer"
import { diffSummary as localDiffSummary, diffFile as localDiffFile } from "../local-diff"
import { buildKeybindingMap } from "../format-keybinding"
import { resolveVersionModels, buildInitialMessages, type CreatedVersion } from "../multi-version"
import { Semaphore } from "../semaphore"
import { PLATFORM } from "../constants"
import type { AgentManagerOutMessage, AgentManagerInMessage } from "../types"
import type { Host, PanelContext, OutputHandle, Disposable } from "../host"
import { Logger } from "../../stratacode/logger"
import { AgentManagerProvider } from "../AgentManagerProvider";

export function onRequestState(provider: AgentManagerProvider): void {
void provider.stateReady
?.then(() => {
// When the folder is not a git repo (or has no folder open),
// provider.state is never created. pushState() silently returns in that
// case, so re-send the empty/non-git state explicitly.
if (!provider.state) {
  provider.pushEmptyState()
  return
}
provider.pushState()
// Re-send cached stats so the webview gets them even if the poller
// already emitted before the webview was ready to receive messages.
if (provider.cachedWorktreeStats) provider.postToWebview(provider.cachedWorktreeStats)
if (provider.cachedLocalStats) provider.postToWebview(provider.cachedLocalStats)
provider.prBridge.replay()
// Refresh sessions after pushState so the webview's sessionsLoaded
// handler is guaranteed to be registered (requestState fires from
// onMount). Without provider, the initial refreshSessions() in
// initializeState() can race ahead of webview mount, causing
// sessionsLoaded to never flip to true.
if (provider.state.getSessions().length > 0) {
  provider.panel?.sessions.refreshSessions()
}
})
.catch((err) => {
provider.log("initializeState failed, pushing partial state:", err)
if (!provider.state) {
  provider.pushEmptyState()
  return
}
provider.pushState()
})
}
