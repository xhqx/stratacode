
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

export function onWorktreePresence(provider: AgentManagerProvider, result: WorktreePresenceResult): void {
const state = provider.state
if (!state) return

const worktrees = state.getWorktrees()
const ids = new Set(worktrees.map((wt) => wt.id))
provider.pruneStaleWorktreeIds(ids)

if (result.degraded) {
  provider.log("Skipping stale worktree update: degraded worktree probe")
  return
}

const entries = result.worktrees.filter((item) => ids.has(item.worktreeId))
if (entries.length === 0) return

// Sync branches from git worktree list (no extra git calls)
let branchChanged = false
for (const entry of entries) {
  if (entry.branch && state.updateWorktreeBranch(entry.worktreeId, entry.branch)) {
    branchChanged = true
  }
}

const next = new Set(entries.filter((entry) => entry.missing).map((entry) => entry.worktreeId))
const staleChanged =
  next.size !== provider.staleWorktreeIds.size || [...next].some((worktreeId) => !provider.staleWorktreeIds.has(worktreeId))
provider.staleWorktreeIds = next

if (staleChanged || branchChanged) {
  provider.pushState()
}
}
