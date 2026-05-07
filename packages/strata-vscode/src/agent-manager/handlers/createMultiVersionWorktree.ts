
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

export async function createMultiVersionWorktree(provider: AgentManagerProvider, i: number, versions: number, groupId: string | undefined, branchName: string | undefined, worktreeName: string | undefined, baseBranch: string | undefined, models: any[], providerID: string | undefined, modelID: string | undefined): Promise<CreatedVersion | null> {
provider.log(`Creating worktree ${i + 1}/${versions}`)

const version = versionedName(branchName || worktreeName, i, versions)
const wt = await provider.createWorktreeOnDisk({
  groupId,
  baseBranch,
  branchName: version.branch,
  name: version.branch,
  label: version.label,
})
if (!wt) {
  provider.log(`Failed to create worktree for version ${i + 1}`)
  return null
}

await provider.runSetupScriptForWorktree(wt.result.path, wt.result.branch, wt.worktree.id)

const session = await provider.createSessionInWorktree(wt.result.path, wt.result.branch, wt.worktree.id)
if (!session) {
  const state = provider.getStateManager()
  const manager = provider.getWorktreeManager()
  state?.removeWorktree(wt.worktree.id)
  await manager?.removeWorktree(wt.result.path)
  provider.log(`Failed to create session for version ${i + 1}`)
  return null
}

const state = provider.getStateManager()!
state.addSession(session.id, wt.worktree.id)
provider.registerWorktreeSession(session.id, wt.result.path)
provider.notifyWorktreeReady(session.id, wt.result, wt.worktree.id)

const versionModel = models[i]
const earlyProviderID = versionModel?.providerID ?? providerID
const earlyModelID = versionModel?.modelID ?? modelID
if (earlyProviderID && earlyModelID) {
  provider.postToWebview({
    type: "agentManager.setSessionModel",
    sessionId: session.id,
    providerID: earlyProviderID,
    modelID: earlyModelID,
  })
}

provider.host.capture("Agent Manager Session Started", {
  source: PLATFORM,
  sessionId: session.id,
  worktreeId: wt.worktree.id,
  branch: wt.result.branch,
  multiVersion: true,
  version: i + 1,
  totalVersions: versions,
  groupId,
})
provider.log(`Version ${i + 1} worktree ready: session=${session.id}`)

return {
  worktreeId: wt.worktree.id,
  sessionId: session.id,
  path: wt.result.path,
  branch: wt.result.branch,
  parentBranch: wt.result.parentBranch,
  versionIndex: i,
}
}
