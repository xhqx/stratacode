
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

export function openWorktreeFile(provider: AgentManagerProvider, sessionId: string, filePath: string, line?: number, column?: number): void {
if (isAbsolutePath(filePath)) {
  provider.host.openFile(filePath, line, column)
  return
}
const state = provider.getStateManager()
if (!state) return
const session = state.getSession(sessionId)
const base = session?.worktreeId ? state.getWorktree(session.worktreeId)?.path : provider.getRoot()
if (!base) return
// Resolve real paths to prevent symlink traversal and normalize for
// consistent comparison on both Unix and Windows.
let resolved: string
try {
  const root = fs.realpathSync(base)
  resolved = fs.realpathSync(path.resolve(base, filePath))
  // Directory-boundary check: append path.sep so "/foo/bar" won't match "/foo/bar2/..."
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return
} catch (err) {
  Logger.error("AgentManagerProvider", "Cannot resolve file path:", err)
  return
}
provider.host.openFile(resolved, line, column)
}
