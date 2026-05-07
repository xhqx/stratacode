
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

export async function onCreateWorktree(provider: AgentManagerProvider, baseBranch?: string, branchName?: string): Promise<null> {
await provider.waitForStateReady("onCreateWorktree")

const created = await provider.createWorktreeOnDisk({ baseBranch, branchName })
if (!created) return null

// Run setup script for new worktree (blocks until complete, shows in overlay)
await provider.runSetupScriptForWorktree(created.result.path, created.result.branch, created.worktree.id)

const session = await provider.createSessionInWorktree(created.result.path, created.result.branch, created.worktree.id)
if (!session) {
  const state = provider.getStateManager()
  const manager = provider.getWorktreeManager()
  state?.removeWorktree(created.worktree.id)
  await manager?.removeWorktree(created.result.path)
  provider.pushState()
  return null
}

const state = provider.getStateManager()!
state.addSession(session.id, created.worktree.id)
provider.registerWorktreeSession(session.id, created.result.path)
// Push state before registerSession so the webview's sessionCreated handler
// sees the worktree mapping and routes the session to the worktree tab.
provider.notifyWorktreeReady(session.id, created.result, created.worktree.id)
provider.panel?.sessions.registerSession(session)
provider.host.capture("Agent Manager Session Started", {
  source: PLATFORM,
  sessionId: session.id,
  worktreeId: created.worktree.id,
  branch: created.result.branch,
})
provider.log(`Created worktree ${created.worktree.id} with session ${session.id}`)
return null
}
