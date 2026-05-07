
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

export async function continueFromSidebar(provider: AgentManagerProvider, sessionId: string, progress: (status: string, detail?: string, error?: string) => void): Promise<void> {
const root = provider.getRoot()
if (!root) {
  progress("error", undefined, "No workspace folder open")
  return
}

provider.openPanel()
await provider.waitForStateReady("continueFromSidebar")

await continueInWorktree(
  {
    root,
    getClient: () => provider.connectionService.getClient(),
    createWorktreeOnDisk: (opts) => provider.createWorktreeOnDisk(opts),
    runSetupScript: (p, b, id) => provider.runSetupScriptForWorktree(p, b, id),
    getStateManager: () => provider.getStateManager(),
    registerWorktreeSession: (sid, dir) => provider.registerWorktreeSession(sid, dir),
    registerSession: (session) => provider.panel?.sessions.registerSession(session),
    notifyReady: (sid, result, wid) => provider.notifyWorktreeReady(sid, result, wid),
    capture: (event, props) => provider.host.capture(event, props),
    log: (...args) => provider.log(...args),
  },
  sessionId,
  progress,
)
}
