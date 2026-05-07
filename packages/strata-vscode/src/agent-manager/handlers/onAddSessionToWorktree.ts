
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

export async function onAddSessionToWorktree(provider: AgentManagerProvider, worktreeId: string): Promise<null> {
let client: StrataClient
try {
  client = provider.connectionService.getClient()
} catch (err) {
  provider.log("onAddSessionToWorktree: client not available:", err)
  provider.postToWebview({ type: "error", message: "Not connected to CLI backend" })
  return null
}

const state = provider.getStateManager()
if (!state) return null

const worktree = state.getWorktree(worktreeId)
if (!worktree) {
  provider.log(`Worktree ${worktreeId} not found`)
  return null
}

let session: Session
try {
  const { data } = await client.session.create(
    { directory: worktree.path, platform: PLATFORM },
    { throwOnError: true },
  )
  session = data
} catch (error) {
  const err = getErrorMessage(error)
  provider.postToWebview({ type: "error", message: `Failed to create session: ${err}` })
  provider.host.capture("Agent Manager Session Error", {
    source: PLATFORM,
    error: err,
    context: "addSessionToWorktree",
    worktreeId,
  })
  return null
}

state.addSession(session.id, worktreeId)
provider.registerWorktreeSession(session.id, worktree.path)
provider.pushState()
provider.postToWebview({
  type: "agentManager.sessionAdded",
  sessionId: session.id,
  worktreeId,
})

if (provider.panel) {
  provider.panel.sessions.registerSession(session)
}

provider.host.capture("Agent Manager Session Started", {
  source: PLATFORM,
  sessionId: session.id,
  worktreeId,
})
provider.log(`Added session ${session.id} to worktree ${worktreeId}`)
return null
}
