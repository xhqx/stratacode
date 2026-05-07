
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

export async function runSetupScriptForWorktree(provider: AgentManagerProvider, worktreePath: string, branch?: string, worktreeId?: string): Promise<void> {
const root = provider.getRoot()
if (!root) return

// Always copy .env files from the main repo (before the setup script so it can override)
await copyEnvFiles(root, worktreePath, (msg) => provider.outputChannel.appendLine(`[EnvCopy] ${msg}`))

try {
  const service = provider.getSetupScriptService()
  if (!service || !service.hasScript()) return
  provider.postToWebview({
    type: "agentManager.worktreeSetup",
    status: "creating",
    message: "Running setup script...",
    branch,
    worktreeId,
  })
  const runner = new SetupScriptRunner(
    (msg) => provider.outputChannel.appendLine(`[SetupScriptRunner] ${msg}`),
    service,
    executeVscodeTask,
  )
  await runner.runIfConfigured({ worktreePath, repoPath: root })
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  provider.outputChannel.appendLine(`[AgentManager] Setup script error: ${msg}`)
  provider.postToWebview({
    type: "agentManager.worktreeSetup",
    status: "error",
    message: `Setup script failed: ${msg}`,
    branch,
    worktreeId,
  })
}
}
