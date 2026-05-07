import * as fs from "fs"
import * as path from "path"
import type { StrataClient, Session } from "@stratacode/sdk/v2/client"
import type { StrataConnectionService } from "../services/cli-backend"
import { getErrorMessage } from "../strata-provider-utils"
import { resolveLocalDiffTarget } from "../review-utils"
import { isAbsolutePath } from "../path-utils"
import { WorktreeManager, type CreateWorktreeResult } from "./WorktreeManager"
import { remoteRef, WorktreeStateManager } from "./WorktreeStateManager"
import { handleSection } from "./section-handler"
import { type ChainResult, handled, unhandled } from "./chain-result"
import { chooseBaseBranch, normalizeBaseBranch } from "./base-branch"
import { GitStatsPoller, type LocalStats, type WorktreePresenceResult, type WorktreeStats } from "./GitStatsPoller"
import { PRStatusBridge } from "./pr-status-bridge"
import { GitOps } from "./GitOps"
import { versionedName } from "./branch-name"
import { classifyWorktreeError } from "./git-import"
import { SetupScriptService } from "./SetupScriptService"
import { SetupScriptRunner } from "./SetupScriptRunner"
import { copyEnvFiles } from "./env-copy"
import { SessionTerminalManager } from "./SessionTerminalManager"
import { createTerminalHost } from "./terminal-host"
import { TerminalRouter } from "./terminal-routing"
import { executeVscodeTask } from "./task-runner"
import { startVscodeRunTask } from "./run/task"
import { RunController } from "./run/controller"
import { handleRunMessage } from "./run/message"
import { forkSession } from "./fork-session"
import { continueInWorktree } from "./continue-in-worktree"
import { WorktreeDiffController } from "./worktree-diff-controller"
import { WorktreeImporter } from "./worktree-importer"
import { diffSummary as localDiffSummary, diffFile as localDiffFile } from "./local-diff"

import { buildKeybindingMap } from "./format-keybinding"
import { resolveVersionModels, buildInitialMessages, type CreatedVersion } from "./multi-version"
import { Semaphore } from "./semaphore"
import { PLATFORM } from "./constants"
import type { AgentManagerOutMessage, AgentManagerInMessage } from "./types"
import type { Host, PanelContext, OutputHandle, Disposable } from "./host"
import { Logger } from "../stratacode/logger"
import { openPanel } from "./handlers/openPanel";
import { attachPanel } from "./handlers/attachPanel";
import { initializeState } from "./handlers/initializeState";
import { handleLocalAndContinue } from "./handlers/handleLocalAndContinue";
import { handlePersistSession } from "./handlers/handlePersistSession";
import { handleLoadClearSession } from "./handlers/handleLoadClearSession";
import { onSessionMessage } from "./handlers/onSessionMessage";
import { onUiMessage } from "./handlers/onUiMessage";
import { onStateMessage } from "./handlers/onStateMessage";
import { onImportMessage } from "./handlers/onImportMessage";
import { onDiffMessage } from "./handlers/onDiffMessage";
import { onRequestState } from "./handlers/onRequestState";
import { resolveBaseBranch } from "./handlers/resolveBaseBranch";
import { createWorktreeOnDisk } from "./handlers/createWorktreeOnDisk";
import { createSessionInWorktree } from "./handlers/createSessionInWorktree";
import { notifyWorktreeReady } from "./handlers/notifyWorktreeReady";
import { onCreateWorktree } from "./handlers/onCreateWorktree";
import { onDeleteWorktree } from "./handlers/onDeleteWorktree";
import { onRemoveStaleWorktree } from "./handlers/onRemoveStaleWorktree";
import { onPromoteSession } from "./handlers/onPromoteSession";
import { onAddSessionToWorktree } from "./handlers/onAddSessionToWorktree";
import { onForkSession } from "./handlers/onForkSession";
import { createMultiVersionWorktree } from "./handlers/createMultiVersionWorktree";
import { createMultiVersionWorktrees } from "./handlers/createMultiVersionWorktrees";
import { onCreateMultiVersion } from "./handlers/onCreateMultiVersion";
import { runSetupScriptForWorktree } from "./handlers/runSetupScriptForWorktree";
import { adoptFollowupInWorktree } from "./handlers/adoptFollowupInWorktree";
import { onWorktreePresence } from "./handlers/onWorktreePresence";
import { pushState } from "./handlers/pushState";
import { openWorktreeFile } from "./handlers/openWorktreeFile";
import { continueFromSidebar } from "./handlers/continueFromSidebar";

/**
 * AgentManagerProvider opens the Agent Manager panel.
 *
 * Uses WorktreeStateManager for centralized state persistence. Worktrees and
 * sessions are stored in `.strata/agent-manager.json`. The UI shows two
 * sections: WORKTREES (top) with managed worktrees + their sessions, and
 * SESSIONS (bottom) with unassociated local sessions.
 */
export class AgentManagerProvider implements Disposable {
  public static readonly viewType = "strata-code.new.AgentManagerPanel"

  panel: PanelContext | undefined
  outputChannel: OutputHandle
  worktrees: WorktreeManager | undefined
  state: WorktreeStateManager | undefined
  setupScript: SetupScriptService | undefined
  importer: WorktreeImporter
  terminalManager: SessionTerminalManager
  terminalRouter: TerminalRouter
  run: RunController
  stateReady: Promise<void> | undefined
  statsPoller: GitStatsPoller
  prBridge!: PRStatusBridge
  gitOps: GitOps
  diffs: WorktreeDiffController
  staleWorktreeIds = new Set<string>()
  cachedWorktreeStats: { type: "agentManager.worktreeStats"; stats: WorktreeStats[] } | undefined
  cachedLocalStats: { type: "agentManager.localStats"; stats: LocalStats } | undefined

  /** Session ID most recently loaded via a `loadMessages` message from the webview.
   *  Updated synchronously — unlike the session provider's currentSession which depends on
   *  an async `session.get` round-trip and can be stale during rapid tab switches. */
  activeSessionId: string | undefined
  constructor(
    public readonly host: Host,
    public readonly connectionService: StrataConnectionService,
  ) {
    this.outputChannel = host.createOutput("Strata Agent Manager")
    this.terminalManager = new SessionTerminalManager(
      (msg) => this.outputChannel.appendLine(`[SessionTerminal] ${msg}`),
      createTerminalHost(),
    )
    this.terminalRouter = new TerminalRouter({
      getClient: () => this.connectionService.getClient(),
      getServerConfig: () => this.connectionService.getServerConfig() ?? undefined,
      getRoot: () => this.getRoot(),
      getWorktreePath: (id) => this.getStateManager()?.getWorktree(id)?.path,
      log: (...args) => this.log("[XTerm]", ...args),
      post: (msg) => this.postToWebview(msg),
    })
    this.run = new RunController({
      root: () => this.getRoot(),
      state: () => this.getStateManager(),
      open: (file) => this.host.openDocument(file),
      start: startVscodeRunTask,
      post: (status) => this.postToWebview({ type: "agentManager.runStatus", ...status }),
      error: (message) => this.postToWebview({ type: "error", message }),
      log: (msg) => this.outputChannel.appendLine(`[RunScript] ${msg}`),
      refresh: () => this.pushState(),
    })
    this.importer = new WorktreeImporter({
      manager: () => this.getWorktreeManager(),
      state: () => this.getStateManager(),
      post: (msg) => this.postToWebview(msg),
      push: () => this.pushState(),
      setup: (dir, branch, id) => this.runSetupScriptForWorktree(dir, branch, id),
      session: (dir, branch, id) => this.createSessionInWorktree(dir, branch, id),
      register: (sid, dir) => this.registerWorktreeSession(sid, dir),
      ready: (sid, result, id) => this.notifyWorktreeReady(sid, result, id),
      log: (...args) => this.log(...args),
    })
    const semaphore = new Semaphore(3)
    this.gitOps = new GitOps({ log: (...args) => this.log(...args), semaphore })
    this.diffs = new WorktreeDiffController({
      getState: () => this.getStateManager(),
      getRoot: () => this.getRoot(),
      getStateReady: () => this.stateReady,
      getClient: () => this.connectionService.getClient(),
      git: this.gitOps,
      localDiff: (dir, base) => localDiffSummary(this.gitOps, dir, base, (...args) => this.log(...args)),
      localDiffFile: (dir, base, file) => localDiffFile(this.gitOps, dir, base, file, (...args) => this.log(...args)),
      post: (msg) => this.postToWebview(msg),
      log: (...args) => this.log(...args),
    })
    this.statsPoller = new GitStatsPoller({
      getWorktrees: () => this.state?.getWorktrees() ?? [],
      getWorkspaceRoot: () => this.getRoot(),
      localDiff: (dir, base) => localDiffSummary(this.gitOps, dir, base, (...args) => this.log(...args)),
      semaphore,
      onStats: (stats) => {
        const msg = { type: "agentManager.worktreeStats" as const, stats }
        this.cachedWorktreeStats = msg
        this.postToWebview(msg)
      },
      onLocalStats: (stats) => {
        const msg = { type: "agentManager.localStats" as const, stats }
        this.cachedLocalStats = msg
        this.postToWebview(msg)
      },
      onWorktreePresence: (presence) => {
        this.onWorktreePresence(presence)
      },
      log: (...args) => this.log(...args),
      git: this.gitOps,
    })
    this.prBridge = PRStatusBridge.create({
      getWorktrees: () => this.state?.getWorktrees() ?? [],
      getWorkspaceRoot: () => this.getRoot(),
      postToWebview: (m) => this.postToWebview(m),
      updateWorktreePR: (id, n, u, s) => this.state?.updateWorktreePR(id, n, u, s),
      hasPersistedPR: (id: string) => !!this.state?.getWorktree(id)?.prNumber,
      openExternal: (u) => this.host.openExternal(u),
      log: (...a) => this.log(...a),
      semaphore,
    })
  }

  log(...args: unknown[]) {
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
    this.outputChannel.appendLine(`${new Date().toISOString()} ${msg}`)
  }

  public openPanel(): void {
      return openPanel(this);
  }

  /** Restore the Agent Manager panel from a previously serialized state.
   *  The caller (extension.ts / vscode-host.ts) wraps the raw panel before passing it. */
  public deserializePanel(ctx: PanelContext): void {
    if (this.panel) {
      this.log("Panel already exists during deserialization, disposing duplicate")
      ctx.dispose()
      return
    }
    this.log("Deserializing Agent Manager panel")
    this.attachPanel(ctx)
  }

  /** Message interceptor — exposed for the deserialization path in extension.ts. */
  public handleMessage(msg: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return this.onMessage(msg)
  }

  /** Wire up a panel context (shared by openPanel and deserializePanel). */
  attachPanel(ctx: PanelContext): void {
      return attachPanel(this, ctx);
  }

  // ---------------------------------------------------------------------------
  // State initialization
  // ---------------------------------------------------------------------------

  async initializeState(): Promise<void> {
      return initializeState(this);
  }

  // ---------------------------------------------------------------------------
  // Message interceptor
  // ---------------------------------------------------------------------------

  readonly messageHandlers: Array<(m: AgentManagerInMessage, msg: Record<string, unknown>) => Promise<ChainResult> | ChainResult> = [
    (m) => this.onWorktreeMessage(m),
    (m, msg) => this.onSessionMessage(m, msg),
    (m, msg) => this.onUiMessage(m, msg),
    (m) => this.onStateMessage(m),
    (m) => this.onImportMessage(m),
    (m) => this.onDiffMessage(m),
    (m) => this.onBridgeMessage(m),
    (m) => this.terminalRouter.handle(m) ? handled() : unhandled()
  ]

  async onMessage(msg: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (this.prBridge.handleMessage(msg)) return null
    if (msg.type === "requestFileSearch" && typeof msg.sessionID !== "string" && this.activeSessionId) {
      return { ...msg, sessionID: this.activeSessionId }
    }
    msg = await this.contextMessage(msg)
    const m = msg as unknown as AgentManagerInMessage

    for (const handler of this.messageHandlers) {
      const result = await handler(m, msg)
      if (result.handled) return result.response
    }

    return msg
  }

  async contextMessage(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (msg.type !== "requestGitChangesContext") return msg
    const ctx = typeof msg.agentManagerContext === "string" ? msg.agentManagerContext : undefined
    const target = ctx ? await this.contextTarget(ctx) : undefined
    const sid = typeof msg.sessionID === "string" ? msg.sessionID : this.activeSessionId
    const next = sid && typeof msg.sessionID !== "string" ? { ...msg, sessionID: sid } : msg
    if (target) return { ...next, ...target }
    if (!sid) return next

    const state = this.getStateManager()
    const session = state?.getSession(sid)
    const worktree = session?.worktreeId ? state?.getWorktree(session.worktreeId) : undefined
    if (!worktree) return next
    return { ...next, contextDirectory: worktree.path, gitChangesBase: remoteRef(worktree) }
  }

  async contextTarget(ctx: string): Promise<Record<string, unknown> | undefined> {
    if (ctx === "local") {
      const root = this.getRoot()
      if (!root) return undefined
      const target = await resolveLocalDiffTarget(this.gitOps, (...args) => this.log(...args), root)
      if (!target) return { contextDirectory: root }
      return { contextDirectory: target.directory, gitChangesBase: target.baseBranch }
    }

    const worktree = this.getStateManager()?.getWorktree(ctx)
    if (!worktree) return undefined
    return { contextDirectory: worktree.path, gitChangesBase: remoteRef(worktree) }
  }

  async onWorktreeMessage(m: AgentManagerInMessage): Promise<ChainResult> {
    switch (m.type) {
      case "agentManager.createWorktree": return handled(await this.onCreateWorktree(m.baseBranch, m.branchName))
      case "agentManager.deleteWorktree": return handled(await this.onDeleteWorktree(m.worktreeId))
      case "agentManager.removeStaleWorktree": return handled(await this.onRemoveStaleWorktree(m.worktreeId))
      case "agentManager.promoteSession": return handled(await this.onPromoteSession(m.sessionId))
      case "agentManager.addSessionToWorktree": return handled(await this.onAddSessionToWorktree(m.worktreeId))
      case "agentManager.forkSession": return handled(await this.onForkSession(m.sessionId, m.worktreeId, m.messageId))
      case "agentManager.closeSession": return handled(await this.onCloseSession(m.sessionId))
      default: return unhandled()
    }
  }

  handleLocalAndContinue(m: AgentManagerInMessage): boolean {
      return handleLocalAndContinue(this, m);
  }

  handlePersistSession(m: AgentManagerInMessage): boolean {
      return handlePersistSession(this, m);
  }

  handleLoadClearSession(m: AgentManagerInMessage): boolean {
      return handleLoadClearSession(this, m);
  }

  onSessionMessage(
    m: AgentManagerInMessage,
    msg: Record<string, unknown>,
  ): ChainResult {
      return onSessionMessage(this, m, msg);
  }

  onUiMessage(
    m: AgentManagerInMessage,
    msg: Record<string, unknown>,
  ): ChainResult {
      return onUiMessage(this, m, msg);
  }

  onStateMessage(m: AgentManagerInMessage): ChainResult {
      return onStateMessage(this, m);
  }

  onImportMessage(m: AgentManagerInMessage): ChainResult {
      return onImportMessage(this, m);
  }

  onDiffMessage(m: AgentManagerInMessage): ChainResult {
      return onDiffMessage(this, m);
  }

  onBridgeMessage(m: AgentManagerInMessage): ChainResult {
    if (m.type !== "openFile") return unhandled()

    const sessionId = this.activeSessionId
    const state = this.getStateManager()
    if (sessionId && state?.directoryFor(sessionId)) {
      this.openWorktreeFile(sessionId, m.filePath, m.line, m.column)
      return handled()
    }
    return handled()
  }

  onRequestState(): void {
      return onRequestState(this);
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /** Resolve the effective base branch using the configured default, explicit override, and existence check. */
  async resolveBaseBranch(
    manager: WorktreeManager,
    state: WorktreeStateManager,
    explicit?: string,
  ): Promise<string | undefined> {
      return resolveBaseBranch(this, manager, state, explicit);
  }

  /** Reset a stale default base branch and notify the webview. */
  clearStaleDefaultBaseBranch(state: WorktreeStateManager, stale: string): void {
    this.log(`Default base branch "${stale}" no longer exists, clearing`)
    state.setDefaultBaseBranch(undefined)
    this.pushState()
  }

  /** Create a git worktree on disk and register it in state. Returns null on failure. */
  async createWorktreeOnDisk(opts?: {
    groupId?: string
    baseBranch?: string
    branchName?: string
    existingBranch?: string
    name?: string
    label?: string
  }): Promise<{
    worktree: ReturnType<WorktreeStateManager["addWorktree"]>
    result: CreateWorktreeResult
  } | null> {
      return createWorktreeOnDisk(this, opts);
  }

  /** Create a CLI session in a worktree directory. Returns null on failure. */
  async createSessionInWorktree(
    worktreePath: string,
    branch: string,
    worktreeId?: string,
  ): Promise<Session | null> {
      return createSessionInWorktree(this, worktreePath, branch, worktreeId);
  }

  /** Send worktreeSetup.ready + sessionMeta + pushState after worktree creation. */
  notifyWorktreeReady(sessionId: string, result: CreateWorktreeResult, worktreeId?: string): void {
      return notifyWorktreeReady(this, sessionId, result, worktreeId);
  }

  async waitForStateReady(context: string): Promise<void> {
    if (!this.stateReady) return
    await this.stateReady.catch((err) => this.log(`${context}: stateReady rejected, continuing:`, err))
  }

  // ---------------------------------------------------------------------------
  // Worktree actions
  // ---------------------------------------------------------------------------

  /** Create a new worktree with an auto-created first session. */
  async onCreateWorktree(baseBranch?: string, branchName?: string): Promise<null> {
      return onCreateWorktree(this, baseBranch, branchName);
  }

  /** Delete a worktree and dissociate its sessions. */
  async onDeleteWorktree(worktreeId: string): Promise<null> {
      return onDeleteWorktree(this, worktreeId);
  }

  /** Remove a stale worktree entry from state without touching the filesystem. */
  async onRemoveStaleWorktree(worktreeId: string): Promise<null> {
      return onRemoveStaleWorktree(this, worktreeId);
  }

  /** Promote a session: create a worktree and move the session into it. */
  async onPromoteSession(sessionId: string): Promise<null> {
      return onPromoteSession(this, sessionId);
  }

  /** Add a new session to an existing worktree. */
  async onAddSessionToWorktree(worktreeId: string): Promise<null> {
      return onAddSessionToWorktree(this, worktreeId);
  }

  onForkSession(sessionId: string, worktreeId?: string, messageId?: string) {
      return onForkSession(this, sessionId, worktreeId, messageId);
  }

  /** Close (remove) a session from its worktree. */
  async onCloseSession(sessionId: string): Promise<null> {
    const state = this.getStateManager()
    if (!state) return null

    state.removeSession(sessionId)
    this.pushState()
    this.log(`Closed session ${sessionId}`)
    return null
  }

  // ---------------------------------------------------------------------------
  // Multi-version worktree creation
  // ---------------------------------------------------------------------------

  async createMultiVersionWorktree(
    i: number,
    versions: number,
    groupId: string | undefined,
    branchName: string | undefined,
    worktreeName: string | undefined,
    baseBranch: string | undefined,
    models: any[],
    providerID: string | undefined,
    modelID: string | undefined,
  ): Promise<CreatedVersion | null> {
      return createMultiVersionWorktree(this, i, versions, groupId, branchName, worktreeName, baseBranch, models, providerID, modelID);
  }

  async createMultiVersionWorktrees(
    versions: number,
    groupId: string | undefined,
    branchName: string | undefined,
    worktreeName: string | undefined,
    baseBranch: string | undefined,
    models: any[],
    providerID: string | undefined,
    modelID: string | undefined,
  ): Promise<CreatedVersion[]> {
      return createMultiVersionWorktrees(this, versions, groupId, branchName, worktreeName, baseBranch, models, providerID, modelID);
  }

  /** Create N worktree sessions for the same prompt (multi-version mode). */
  async onCreateMultiVersion(
    msg: Extract<AgentManagerInMessage, { type: "agentManager.createMultiVersion" }>,
  ): Promise<null> {
      return onCreateMultiVersion(this, msg);
  }

  // ---------------------------------------------------------------------------
  // Keybindings
  // ---------------------------------------------------------------------------

  sendKeybindings(): void {
    const keybindings = this.host.extensionKeybindings()
    const bindings = buildKeybindingMap(keybindings, process.platform === "darwin")
    this.postToWebview({ type: "agentManager.keybindings", bindings })
  }

  // ---------------------------------------------------------------------------
  // Setup script
  // ---------------------------------------------------------------------------

  /** Open the worktree setup script in the editor for user configuration. */
  async configureSetupScript(): Promise<void> {
    const service = this.getSetupScriptService()
    if (!service) return
    try {
      if (!service.hasScript()) {
        await service.createDefaultScript()
      }
      const resolved = service.resolveScript()
      if (!resolved) return
      await this.host.openDocument(resolved.path)
    } catch (error) {
      this.log(`Failed to open setup script: ${error}`)
    }
  }

  /** Copy .env files and run the worktree setup script. Blocks until complete. Shows progress in overlay. */
  async runSetupScriptForWorktree(worktreePath: string, branch?: string, worktreeId?: string): Promise<void> {
      return runSetupScriptForWorktree(this, worktreePath, branch, worktreeId);
  }

  // ---------------------------------------------------------------------------
  // Repo info
  // ---------------------------------------------------------------------------

  async sendRepoInfo(): Promise<void> {
    const manager = this.getWorktreeManager()
    if (!manager) return
    try {
      const branch = await manager.currentBranch()
      const defaultBranch = await manager.defaultBranch()
      this.postToWebview({ type: "agentManager.repoInfo", branch, defaultBranch })
    } catch (error) {
      this.log(`Failed to get current branch: ${error}`)
    }
  }

  // ---------------------------------------------------------------------------
  // State helpers
  // ---------------------------------------------------------------------------

  registerWorktreeSession(sessionId: string, directory: string): void {
    if (!this.panel) return
    this.panel.sessions.setSessionDirectory(sessionId, directory)
    this.panel.sessions.trackSession(sessionId)
    // Recover any permission/question prompts that arrived before the session
    // was tracked. The CLI backend may have emitted permission.asked between
    // session.create() returning and this registration completing.
    this.panel.sessions.recoverPendingPrompts()
  }

  /** Route a plan follow-up session to its worktree instead of LOCAL. */
  adoptFollowupInWorktree(session: Session, directory: string): void {
      return adoptFollowupInWorktree(this, session, directory);
  }

  onWorktreePresence(result: WorktreePresenceResult): void {
      return onWorktreePresence(this, result);
  }

  clearStaleTracking(worktreeId: string): void {
    this.staleWorktreeIds.delete(worktreeId)
  }

  staleWorktreesForState(worktrees: ReturnType<WorktreeStateManager["getWorktrees"]>): string[] {
    const ids = new Set(worktrees.map((wt) => wt.id))
    this.pruneStaleWorktreeIds(ids)
    return worktrees.filter((wt) => this.staleWorktreeIds.has(wt.id)).map((wt) => wt.id)
  }

  pruneStaleWorktreeIds(ids: Set<string>): void {
    for (const id of [...this.staleWorktreeIds]) {
      if (ids.has(id)) continue
      this.staleWorktreeIds.delete(id)
    }
  }

  /** Sync the poller's skip set with currently collapsed sections. */
  syncPollerSkips(): void {
    const state = this.state
    if (!state) return
    const skipped = new Set<string>()
    for (const sec of state.getSections()) {
      if (!sec.collapsed) continue
      for (const id of state.getWorktreesInSection(sec.id)) skipped.add(id)
    }
    const stats = this.statsPoller.syncSkips(skipped)
    if (!stats) return
    const msg = { type: "agentManager.worktreeStats" as const, stats }
    this.cachedWorktreeStats = msg
    this.postToWebview(msg)
  }

  pushState(): void {
      return pushState(this);
  }

  /** Push empty state when the folder is not a git repo or has no folder open. */
  pushEmptyState(): void {
    this.staleWorktreeIds.clear()
    this.postToWebview({
      type: "agentManager.state",
      worktrees: [],
      sessions: [],
      staleWorktreeIds: [],
      reviewDiffStyle: "unified",
      isGitRepo: false,
      runStatuses: [],
      runScriptConfigured: false,
    })
  }

  // ---------------------------------------------------------------------------
  // Manager accessors
  // ---------------------------------------------------------------------------

  getRoot(): string | undefined {
    return this.host.workspacePath()
  }

  getWorktreeManager(): WorktreeManager | undefined {
    if (this.worktrees) return this.worktrees
    const root = this.getRoot()
    if (!root) {
      this.log("getWorktreeManager: no folder available")
      return undefined
    }
    this.worktrees = new WorktreeManager(
      root,
      (msg) => this.outputChannel.appendLine(`[WorktreeManager] ${msg}`),
      this.gitOps,
    )
    return this.worktrees
  }

  getStateManager(): WorktreeStateManager | undefined {
    if (this.state) return this.state
    const root = this.getRoot()
    if (!root) {
      this.log("getStateManager: no folder available")
      return undefined
    }
    this.state = new WorktreeStateManager(root, (msg) => this.outputChannel.appendLine(`[StateManager] ${msg}`))
    return this.state
  }

  getSetupScriptService(): SetupScriptService | undefined {
    if (this.setupScript) return this.setupScript
    const root = this.getRoot()
    if (!root) {
      this.log("getSetupScriptService: no folder available")
      return undefined
    }
    this.setupScript = new SetupScriptService(root)
    return this.setupScript
  }

  // ---------------------------------------------------------------------------
  // Worktree file helpers
  // ---------------------------------------------------------------------------

  /** Open a worktree directory directly in VS Code. */
  openWorktreeDirectory(worktreeId: string): void {
    const state = this.getStateManager()
    if (!state) return
    const worktree = state.getWorktree(worktreeId)
    if (!worktree) return
    const target = path.normalize(worktree.path)
    if (!fs.existsSync(target)) {
      this.log(`openWorktreeDirectory: missing path ${target}`)
      this.host.showError("Worktree folder does not exist on disk.")
      return
    }
    this.host.openFolder(target, true)
  }

  /** Open a file from a worktree or local session in the VS Code editor.
   * Absolute paths (Unix `/…` or Windows `C:\…`) are opened directly.
   * Relative paths are resolved against the session's worktree directory
   * (or repo root for local sessions) with symlink-traversal protection. */
  openWorktreeFile(sessionId: string, filePath: string, line?: number, column?: number): void {
      return openWorktreeFile(this, sessionId, filePath, line, column);
  }

  postToWebview(message: AgentManagerOutMessage): void {
    this.panel?.postMessage(message)
  }

  /**
   * Reveal the Agent Manager panel and focus the prompt input.
   * Used for the keyboard shortcut to switch back from terminal.
   */
  public focusPanel(): void {
    if (!this.panel) return
    this.panel.reveal(false)
    this.postToWebview({ type: "action", action: "focusInput" })
  }

  public isActive(): boolean {
    return this.panel?.active === true
  }

  /** Expose worktree session→directory mappings for the auto-approve toggle. */
  public getSessionDirectories(): ReadonlyMap<string, string> {
    return this.panel?.sessions.getSessionDirectories() ?? new Map()
  }

  /**
   * Continue a sidebar session in a new worktree.
   * Captures git state, creates worktree, applies state, forks session.
   * Called from StrataProvider when the sidebar sends "continueInWorktree".
   */
  public async continueFromSidebar(
    sessionId: string,
    progress: (status: string, detail?: string, error?: string) => void,
  ): Promise<void> {
      return continueFromSidebar(this, sessionId, progress);
  }

  public async createFromSidebar(baseBranch?: string, branchName?: string): Promise<void> {
    this.openPanel()
    const panel = this.panel
    if (!panel) return
    await panel.waitForReady()
    await this.waitForStateReady("createFromSidebar")
    await this.onCreateWorktree(baseBranch, branchName)
  }

  public async openAdvancedWorktree(): Promise<void> {
    this.openPanel()
    const panel = this.panel
    if (!panel) return
    await panel.waitForActive()
    await panel.waitForReady()
    await this.waitForStateReady("openAdvancedWorktree")
    queueMicrotask(() => this.postToWebview({ type: "action", action: "advancedWorktree" }))
  }

  handleSection(m: AgentManagerInMessage): ChainResult {
    return handleSection(this.state, m, () => this.pushState())
  }

  public postMessage(message: unknown): void {
    this.panel?.postMessage(message)
  }

  public dispose(): void {
    this.connectionService.unregisterFocused("agent-manager")
    this.connectionService.registerOpen("agent-manager", [])
    this.diffs.stop()
    this.statsPoller.stop()
    this.gitOps.dispose()
    this.prBridge.poller.stop()
    this.run.dispose()
    this.terminalManager.dispose()
    void this.terminalRouter.dispose()
    this.panel?.dispose()
    this.outputChannel.dispose()
    this.host.dispose()
  }
}
