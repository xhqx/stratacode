
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

export function pushState(provider: AgentManagerProvider): void {
const state = provider.state
if (!state) return
const worktrees = state.getWorktrees()
const staleWorktreeIds = provider.staleWorktreesForState(worktrees)
const run = provider.run.state()
provider.postToWebview({
  type: "agentManager.state",
  worktrees,
  sessions: state.getSessions(),
  sections: state.getSections(),
  staleWorktreeIds,
  tabOrder: state.getTabOrder(),
  worktreeOrder: state.getWorktreeOrder(),
  sessionsCollapsed: state.getSessionsCollapsed(),
  reviewDiffStyle: state.getReviewDiffStyle(),
  isGitRepo: true,
  defaultBaseBranch: state.getDefaultBaseBranch(),
  ...run,
})

// Sync skip set before enabling the poller so the first poll cycle
// already excludes worktrees in collapsed sections.
provider.syncPollerSkips()
provider.statsPoller.setEnabled(worktrees.length > 0 || provider.panel !== undefined)
provider.prBridge.poller.setEnabled(worktrees.length > 0)
}
