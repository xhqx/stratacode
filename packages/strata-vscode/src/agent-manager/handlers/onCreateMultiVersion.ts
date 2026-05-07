
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

export async function onCreateMultiVersion(provider: AgentManagerProvider, msg: Extract<AgentManagerInMessage, { type: "agentManager.createMultiVersion" }>): Promise<null> {
await provider.waitForStateReady("onCreateMultiVersion")
const text = msg.text?.trim() || undefined

const worktreeName = msg.name?.trim() || undefined
const agent = msg.agent
const files = msg.files
const baseBranch = msg.baseBranch
const branchName = msg.branchName?.trim() || undefined

const fallback = msg.providerID && msg.modelID ? { providerID: msg.providerID, modelID: msg.modelID } : undefined
const resolved = resolveVersionModels(msg.modelAllocations, fallback, Number(msg.versions) || 1)
const { models, versions, providerID, modelID } = resolved

// Generate a shared group ID for multi-version worktrees
const groupId = versions > 1 ? `grp-${Date.now()}` : undefined

provider.log(
  `Creating ${versions} worktrees${models.length > 0 ? " (model comparison)" : ""}${text ? ` for: ${text.slice(0, 60)}` : ""}${groupId ? ` (group=${groupId})` : ""}`,
)

// Notify webview that multi-version creation has started
provider.postToWebview({
  type: "agentManager.multiVersionProgress",
  status: "creating",
  total: versions,
  completed: 0,
  groupId,
})

// Phase 1: Create all worktrees + sessions first
const created = await provider.createMultiVersionWorktrees(
  versions,
  groupId,
  branchName,
  worktreeName,
  baseBranch,
  models,
  providerID,
  modelID,
)

// Phase 2: Send the initial prompt to all sessions, or clear busy state if no text.
const messages = buildInitialMessages(created, models, { providerID, modelID }, text, agent, msg.variant, files)
for (let i = 0; i < messages.length; i++) {
  const msg = messages[i]!
  if (text) {
    provider.log(`Sending initial message to version ${i + 1} (session=${msg.sessionId})`)
  }
  provider.postToWebview({ type: "agentManager.sendInitialMessage", ...msg })
  if (text && i < messages.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}

// Notify completion
provider.postToWebview({
  type: "agentManager.multiVersionProgress",
  status: "done",
  total: versions,
  completed: created.length,
  groupId,
})

if (created.length === 0) {
  provider.host.showError(`Failed to create any of the ${versions} multi-version worktrees.`)
}

provider.log(`Multi-version creation complete: ${created.length}/${versions} versions`)
return null
}
