
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

export function attachPanel(provider: AgentManagerProvider, ctx: PanelContext): void {
if (provider.panel) {
  provider.log("Disposing previous panel before attaching new one")
  provider.panel.dispose()
  provider.panel = undefined
}
provider.panel = ctx

provider.statsPoller.setVisible(ctx.visible)
ctx.onDidChangeVisibility((visible) => {
  provider.statsPoller.setVisible(visible)
})

ctx.sessions.onFollowupAdopted((session, directory) => {
  provider.adoptFollowupInWorktree(session, directory)
})

provider.stateReady = provider.initializeState()
void provider.sendRepoInfo()
provider.sendKeybindings()
provider.prBridge.attachPanel(ctx)
ctx.onDidDispose(() => {
  // Only clear if provider is still the active panel — a newer panel may
  // have already replaced us via attachPanel.
  if (provider.panel === ctx) {
    provider.log("Panel disposed")
    provider.statsPoller.stop()
    provider.prBridge.poller.stop()
    provider.diffs.stop()
    provider.panel = undefined
  }
  ctx.sessions.dispose()
})
}
