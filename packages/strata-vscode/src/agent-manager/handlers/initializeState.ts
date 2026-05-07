
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

export async function initializeState(provider: AgentManagerProvider): Promise<void> {
const manager = provider.getWorktreeManager()
const state = provider.getStateManager()
if (!manager || !state) {
  provider.pushEmptyState()
  return
}

const migration = await state.load()
manager.cleanupOrphanedTempDirs()

// When the .stratacode → .strata migration rewrote git worktree refs, nudge
// VS Code's git extension to re-discover them. Without provider, worktrees
// won't appear in Source Control until the next VS Code restart.
if (migration.refsFixed > 0) {
  provider.log(`Migration fixed ${migration.refsFixed} git worktree ref(s), refreshing git`)
  provider.host.refreshGit()
}

for (const wt of state.getWorktrees()) {
  for (const s of state.getSessions(wt.id)) {
    provider.panel?.sessions.setSessionDirectory(s.id, wt.path)
    provider.panel?.sessions.trackSession(s.id)
  }
}
for (const s of state.getSessions()) if (!s.worktreeId) provider.panel?.sessions.trackSession(s.id)
provider.pushState()

// Refresh sessions so worktree sessions appear in the list
if (state.getSessions().length > 0) {
  provider.panel?.sessions.refreshSessions()
}

// Recover any pending permission/question prompts that were missed during
// panel recreation or SSE reconnection. Must run after all worktree sessions
// are registered with their directory overrides so the recovery queries the
// correct CLI backend Instances.
provider.panel?.sessions.recoverPendingPrompts()
}
