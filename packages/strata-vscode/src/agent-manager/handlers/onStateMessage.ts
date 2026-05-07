
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

export function onStateMessage(provider: AgentManagerProvider, m: AgentManagerInMessage): ChainResult {
if (m.type === "agentManager.requestState") {
  provider.onRequestState()
  return handled()
}
if (m.type === "agentManager.setTabOrder") {
  provider.state?.setTabOrder(m.key, m.order)
  return handled()
}
if (m.type === "agentManager.setWorktreeOrder") {
  provider.state?.setWorktreeOrder(m.order)
  return handled()
}
if (m.type === "agentManager.setSessionsCollapsed") {
  provider.state?.setSessionsCollapsed(m.collapsed)
  return handled()
}
const sectionResult = provider.handleSection(m)
if (sectionResult.handled) return sectionResult
if (m.type === "agentManager.setReviewDiffStyle") {
  provider.state?.setReviewDiffStyle(m.style)
  return handled()
}
if (m.type === "agentManager.setDefaultBaseBranch") {
  provider.state?.setDefaultBaseBranch(normalizeBaseBranch(m.branch))
  provider.pushState()
  return handled()
}
return unhandled()
}
