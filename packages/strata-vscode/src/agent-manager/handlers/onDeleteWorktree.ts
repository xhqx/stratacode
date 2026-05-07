
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

export async function onDeleteWorktree(provider: AgentManagerProvider, worktreeId: string): Promise<null> {
const manager = provider.getWorktreeManager()
const state = provider.getStateManager()
if (!manager || !state) return null
const worktree = state.getWorktree(worktreeId)
if (!worktree) {
  provider.log(`Worktree ${worktreeId} not found in state`)
  return null
}
// Remove from state BEFORE disk removal so pollers immediately stop targeting provider worktree.
// Pre-emptive skip covers any in-flight poll that already captured getWorktrees().
provider.statsPoller.skipWorktree(worktreeId)
provider.prBridge.remove(worktreeId)
provider.run.remove(worktreeId)
const orphaned = state.removeWorktree(worktreeId)
if (provider.diffs.shouldStopForWorktree(worktree.path, orphaned)) {
  provider.diffs.stop()
}
for (const s of orphaned) provider.panel?.sessions.clearSessionDirectory(s.id)
provider.pushState()
// Disk removal after state is clean — pollers no longer reference provider worktree.
try {
  await manager.removeWorktree(worktree.path, worktree.originalBranch ?? worktree.branch)
} catch (error) {
  provider.log(`Failed to remove worktree from disk: ${error}`)
}
provider.log(`Deleted worktree ${worktreeId} (${worktree.originalBranch ?? worktree.branch})`)
return null
}
