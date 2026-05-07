
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

export function onUiMessage(provider: AgentManagerProvider, m: AgentManagerInMessage, msg: Record<string, unknown>): ChainResult {
if (m.type === "agentManager.configureSetupScript") {
  void provider.configureSetupScript()
  return handled()
}
if (handleRunMessage(provider.run, m)) return handled()
if (m.type === "agentManager.showTerminal") {
  provider.terminalManager.showTerminal(m.sessionId, provider.state)
  return handled()
}
if (m.type === "agentManager.showLocalTerminal") {
  provider.terminalManager.showLocalTerminal()
  return handled()
}
if (m.type === "agentManager.openWorktree") {
  provider.openWorktreeDirectory(m.worktreeId)
  return handled()
}
if (m.type === "agentManager.copyToClipboard") {
  provider.host.copyToClipboard(m.text)
  return handled()
}
if (m.type === "previewImage") return handled(msg)
if (m.type === "agentManager.showExistingLocalTerminal") {
  provider.terminalManager.syncLocalOnSessionSwitch()
  return handled()
}
if (m.type === "agentManager.requestRepoInfo") {
  void provider.sendRepoInfo()
  return handled()
}
if (m.type === "agentManager.createMultiVersion") {
  void provider.onCreateMultiVersion(m)
  return handled()
}
if (m.type === "agentManager.renameWorktree") {
  const state = provider.getStateManager()
  if (state) {
    state.updateWorktreeLabel(m.worktreeId, m.label)
    provider.pushState()
  }
  return handled()
}
return unhandled()
}
