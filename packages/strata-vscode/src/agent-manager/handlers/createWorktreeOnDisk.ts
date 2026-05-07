
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

export async function createWorktreeOnDisk(provider: AgentManagerProvider, opts?: {
    groupId?: string
    baseBranch?: string
    branchName?: string
    existingBranch?: string
    name?: string
    label?: string
  }): Promise<{
    worktree: ReturnType<WorktreeStateManager["addWorktree"]>
    result: CreateWorktreeResult
  } | null> {
const manager = provider.getWorktreeManager()
const state = provider.getStateManager()
if (!manager || !state) {
  provider.postToWebview({
    type: "agentManager.worktreeSetup",
    status: "error",
    message: "Open a folder that contains a git repository to use worktrees",
    errorCode: "not_git_repo",
  })
  return null
}

provider.postToWebview({ type: "agentManager.worktreeSetup", status: "creating", message: "Creating git worktree..." })

// Resolve effective base branch using configured default
const effectiveBase = opts?.existingBranch
  ? undefined
  : await provider.resolveBaseBranch(manager, state, opts?.baseBranch)

let result: CreateWorktreeResult
try {
  result = await manager.createWorktree({
    prompt: opts?.name || "strata",
    baseBranch: effectiveBase ?? opts?.baseBranch,
    branchName: opts?.branchName,
    existingBranch: opts?.existingBranch,
  })
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  provider.postToWebview({
    type: "agentManager.worktreeSetup",
    status: "error",
    message: msg,
    errorCode: classifyWorktreeError(msg),
  })
  provider.host.capture("Agent Manager Session Error", {
    source: PLATFORM,
    error: msg,
    context: "createWorktree",
  })
  return null
}

const worktree = state.addWorktree({
  branch: result.branch,
  path: result.path,
  parentBranch: result.parentBranch,
  remote: result.remote,
  groupId: opts?.groupId,
  label: opts?.label,
})

// Push state immediately so the sidebar shows the new worktree with a loading indicator
provider.pushState()
provider.postToWebview({
  type: "agentManager.worktreeSetup",
  status: "creating",
  message: "Setting up worktree...",
  branch: result.branch,
  worktreeId: worktree.id,
})

return { worktree, result }
}
