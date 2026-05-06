import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { applyPatch, parsePatch, reversePatch } from "diff"
import type { StrataConnectionService } from "./services/cli-backend"
import { buildWebviewHtml } from "./utils"
import { GitOps } from "./agent-manager/GitOps"
import { WorktreeDiffClient, type DiffTarget } from "./worktree-diff-client"
import { diffSummary, batchPatches, ancestor } from "./agent-manager/local-diff"
import {
  appendOutput,
  getWorkspaceRoot,
  hashFileDiffs,
  openWorkspaceRelativeFile,
  resolveLocalDiffTarget,
} from "./review-utils"
import { getErrorMessage } from "./strata-provider-utils"
import { buildIndexedPatches, parseExplainResponse, shouldPreSkip, buildExplainPrompt } from "./explain-skip"
import { Logger } from "./stratacode/logger"

// Using explicit interface to avoid rootDir TS6059 errors since agent-manager types live in webview-ui
export interface ReviewThread {
  id: string
  file: string
  side?: "left" | "right" | "additions" | "deletions"
  line: number
  endLine?: number
  messages: {
    id: string
    author: "user" | "ai"
    text: string
    timestamp: number
  }[]
  pending?: boolean
}

/**
 * DiffViewerProvider opens a full-screen diff viewer in an editor tab.
 * It shows the local workspace diff and forwards review comments back to the sidebar chat.
 */
interface ExplanationCache {
  hash: string
  threads: ReviewThread[]
  summary: string
}

const CACHE_KEY = "strata.diffExplanations"

export class DiffViewerProvider implements vscode.Disposable {
  public static readonly viewType = "strata-code.new.DiffViewerPanel"

  private panel: vscode.WebviewPanel | undefined
  private diffInterval: ReturnType<typeof setInterval> | undefined
  private lastDiffHash: string | undefined
  private cachedDiffTarget: DiffTarget | undefined
  private polling = false
  private gitOps: GitOps
  private outputChannel: vscode.OutputChannel
  private onSendComments: ((comments: unknown[], autoSend: boolean) => void) | undefined
  private onExplainTask: ((prompt: string) => void) | undefined
  private sessionId: string | undefined
  private sessionPatches = new Map<string, string>()

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionService: StrataConnectionService,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.gitOps = new GitOps({ log: (...args) => this.log(...args) })
    this.outputChannel = vscode.window.createOutputChannel("Strata Diff Viewer")
  }

  private log(...args: unknown[]) {
    appendOutput(this.outputChannel, "DiffViewer", ...args)
  }

  public setCommentHandler(handler: (comments: unknown[], autoSend: boolean) => void): void {
    this.onSendComments = handler
  }

  public setExplainHandler(handler: (prompt: string) => void): void {
    this.onExplainTask = handler
  }

  public openPanel(sessionId?: string): void {
    if (this.panel && this.sessionId !== sessionId) {
      this.panel.dispose()
      this.panel = undefined
    }
    this.sessionId = sessionId

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One)
      return
    }

    const title = sessionId ? "Session Changes" : "Changes"
    const panel = vscode.window.createWebviewPanel(DiffViewerProvider.viewType, title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.extensionUri],
    })

    this.wirePanel(panel)
  }

  /** Re-wire a deserialized panel after extension restart. */
  public deserializePanel(panel: vscode.WebviewPanel): void {
    this.wirePanel(panel)
  }

  private wirePanel(panel: vscode.WebviewPanel): void {
    this.panel = panel

    panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "strata-icon.svg"),
      dark: vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "strata-comet-white.svg"),
    }

    panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), undefined, [])
    panel.webview.html = this.getHtml(panel.webview)

    panel.onDidDispose(() => {
      this.log("Panel disposed")
      this.stopDiffPolling()
      this.panel = undefined
    })
  }

  private onMessage(msg: Record<string, unknown>): void {
    const handler = this.handlers[msg.type as string]
    if (handler) handler(msg)
  }

  private handlers: Record<string, (msg: Record<string, unknown>) => void> = {
    webviewReady: () => {
      const config = vscode.workspace.getConfiguration("strata-code.new")
      this.post({
        type: "ready",
        vscodeLanguage: vscode.env.language,
        languageOverride: config.get<string>("language"),
        workspaceDirectory: getWorkspaceRoot(),
      })
      this.startDiffPolling()
    },
    "diffViewer.sendComments": (msg) => {
      if (Array.isArray(msg.comments)) this.onSendComments?.(msg.comments, !!msg.autoSend)
    },
    "diffViewer.close": () => this.panel?.dispose(),
    "diffViewer.setDiffStyle": () => {
      /* handled by webview internally */
    },
    "diffViewer.revertFile": (msg) => {
      if (typeof msg.file === "string") void this.revertFile(msg.file)
    },
    openFile: (msg) => {
      if (typeof msg.filePath === "string") {
        this.openDiffView(msg.filePath, typeof msg.line === "number" ? msg.line : undefined)
      }
    },
    "diffViewer.explainAll": () => void this.explainAll(),
    "diffViewer.replyToThread": (msg) => {
      if (typeof msg.threadId === "string" && typeof msg.text === "string") {
        void this.replyToThread(msg.threadId, msg.text)
      }
    },
    "diffViewer.startThread": (msg) => {
      if (
        typeof msg.threadId === "string" &&
        typeof msg.file === "string" &&
        typeof msg.line === "number" &&
        typeof msg.text === "string"
      ) {
        void this.startThread(
          msg.threadId,
          msg.file,
          msg.line,
          typeof msg.endLine === "number" ? msg.endLine : undefined,
          msg.text,
          msg.side as "left" | "right" | undefined,
        )
      }
    },
    "diffViewer.requestDiff": (msg) => {
      if (typeof msg.file === "string") void this.handleRequestDiff(msg.file)
    },
    requestSetting: (msg) => {
      if (typeof msg.key !== "string") return
      const parts = msg.key.split(".")
      const leaf = parts.pop() ?? ""
      const ns = parts.length > 0 ? `strata-code.new.${parts.join(".")}` : "strata-code.new"
      const value = vscode.workspace.getConfiguration(ns).get(leaf)
      Logger.info("DiffViewerProvider", `requestSetting: ${msg.key} →`, value)
      this.post({ type: "settingLoaded", key: msg.key, value })
    },
  }

  private async handleRequestDiff(file: string): Promise<void> {
    if (this.sessionId) {
      return this.handleSessionRequestDiff(file)
    }
    const target = this.cachedDiffTarget ?? (await this.resolveLocalDiffTarget())
    if (!target) return
    try {
      // Use dynamic import like others to ensure local-diff is available
      const { diffFile } = await import("./agent-manager/local-diff")
      const diff = await diffFile(this.gitOps, target.directory, target.baseBranch, file, (...args) =>
        this.log(...args),
      )
      this.post({
        type: "diffViewer.diffFile",
        file,
        diff,
      })
    } catch (err) {
      this.log(`Failed to fetch diff for ${file}:`, err)
    }
  }

  /** Open a file in the editor — tracked files get a diff view, new files open normally */
  private async openDiffView(file: string, line?: number): Promise<void> {
    const root = getWorkspaceRoot()
    if (!root) return
    const uri = vscode.Uri.file(`${root}/${file}`)

    const selection = line ? new vscode.Range(line - 1, 0, line - 1, 0) : undefined
    const options: vscode.TextDocumentShowOptions = {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
      selection,
    }

    // Check if the file is tracked by git
    const result = await this.gitOps.execGit(["ls-files", "--error-unmatch", "--", file], root)
    if (result.code === 0) {
      // Tracked file — open side-by-side diff against HEAD
      const headUri = uri.with({
        scheme: "git",
        query: JSON.stringify({ path: uri.fsPath, ref: "HEAD" }),
      })
      vscode.commands
        .executeCommand("vscode.diff", headUri, uri, `${file} (Working Changes)`, options)
        .then(undefined, () => {
          // Fallback if git: URI scheme fails
          vscode.workspace.openTextDocument(uri).then((doc) => vscode.window.showTextDocument(doc, options))
        })
    } else {
      // Untracked / new file — just open it
      vscode.workspace.openTextDocument(uri).then((doc) => vscode.window.showTextDocument(doc, options))
    }
  }

  private explainSession: string | undefined

  // --- Explanation cache helpers (workspaceState) ---

  private saveExplanations(threads: ReviewThread[], summary: string): void {
    const hash = this.lastDiffHash
    if (!hash) return
    const cache: ExplanationCache = { hash, threads, summary }
    this.context.workspaceState.update(CACHE_KEY, cache)
    this.log("saveExplanations: cached", threads.length, "thread(s) for hash", hash)
  }

  private loadExplanations(): ExplanationCache | undefined {
    return this.context.workspaceState.get<ExplanationCache>(CACHE_KEY)
  }

  private clearExplanations(): void {
    this.context.workspaceState.update(CACHE_KEY, undefined)
  }

  private restoreExplanationsIfCached(): void {
    const cache = this.loadExplanations()
    if (!cache) return
    if (cache.hash !== this.lastDiffHash) {
      this.log("restoreExplanations: hash mismatch, clearing cache")
      this.clearExplanations()
      return
    }
    this.log("restoreExplanations: restoring", cache.threads.length, "thread(s)")
    this.post({
      type: "diffViewer.explainResult",
      threads: cache.threads,
      summary: cache.summary,
      done: true,
    })
  }

  private async getValidDiffsToExplain(target: DiffTarget): Promise<{ validDiffs: { file: string; patch: string }[], firstCheck: string }> {
    const anc = await ancestor(this.gitOps, target.directory, target.baseBranch, (...args) => this.log(...args))
    const diffs = await diffSummary(this.gitOps, target.directory, target.baseBranch, (...args) => this.log(...args))
    this.log(`explainAll: ${diffs.length} file(s) found`)

    const effort = vscode.workspace.getConfiguration("strata-code.new.explainer").get<string>("effort", "medium")

    const validDiffs: { file: string; patch: string }[] = []
    const candidates = diffs.filter((d) => !d.generatedLike)

    const patchMap = await batchPatches(
      this.gitOps,
      target.directory,
      anc ?? "",
      candidates.map((d) => ({ file: d.file, tracked: d.tracked })),
      (...args) => this.log(...args),
    )

    for (const d of candidates) {
      const patch = patchMap.get(d.file)
      if (!patch || shouldPreSkip(patch, effort)) continue
      validDiffs.push({ file: d.file, patch })
    }

    const { annotatedDiffs: firstCheck } = buildIndexedPatches(validDiffs)
    return { validDiffs, firstCheck }
  }

  private async initializeExplainSession(root: string): Promise<string | undefined> {
    const client = this.connectionService.getClient()
    
    if (!this.explainSession) {
      this.log("explainAll: creating new session")
      const { data } = await client.session.create({ directory: root }, { throwOnError: true })
      this.explainSession = data.id
      this.connectionService.hideSession(data.id)
      this.log("explainAll: session created:", this.explainSession)
    }

    let sessionContext: string | undefined
    try {
      const res = await client.getWorkerContext({
        directory: root,
        tier: "big",
      })
      if (res.data?.summary) sessionContext = res.data.summary
    } catch (err) {
      this.log("explainAll: session context fetch failed, continuing without", err)
    }
    return sessionContext
  }

  private async processExplainBatches(
    validDiffs: { file: string; patch: string }[],
    sessionContext: string | undefined,
    root: string,
    explainSession: string
  ): Promise<{ allThreads: ReviewThread[]; summary: string }> {
    const BATCH_SIZE = 5
    const allThreads: ReviewThread[] = []
    let summary = ""
    const client = this.connectionService.getClient()

    for (let i = 0; i < validDiffs.length; i += BATCH_SIZE) {
      const chunk = validDiffs.slice(i, i + BATCH_SIZE)
      const last = i + BATCH_SIZE >= validDiffs.length
      const { annotatedDiffs, lineMap } = buildIndexedPatches(chunk)

      if (!annotatedDiffs.trim()) {
        if (last) {
          this.post({
            type: "diffViewer.explainResult",
            threads: [],
            summary: summary || "Explanation completed.",
            done: true,
          })
        }
        continue
      }

      const prompt = buildExplainPrompt(annotatedDiffs, sessionContext)

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Explanation timed out after 60s")), 60_000)
      })

      try {
        this.log(`explainAll: sending batch ${Math.floor(i / BATCH_SIZE) + 1}...`)
        const res = await Promise.race([
          client.session.prompt(
            {
              sessionID: explainSession,
              directory: root,
              agent: "explainer",
              parts: [{ type: "text", text: prompt }],
            },
            { throwOnError: true },
          ),
          timeout,
        ])

        const part = res.data?.parts?.find((p: any) => p.type === "text")
        if (part && "text" in part) {
          const raw = part.text.trim()
          const parsed = parseExplainResponse(raw, lineMap)
          if (parsed.summary) summary = parsed.summary

          const threads: ReviewThread[] = parsed.comments.map((c) => ({
            id: Math.random().toString(36).substring(2, 9),
            file: c.file,
            side: c.side,
            line: c.line,
            ...(c.endLine !== undefined ? { endLine: c.endLine } : {}),
            messages: [
              {
                id: Math.random().toString(36).substring(2, 9),
                author: "ai",
                text: c.text,
                timestamp: Date.now(),
              },
            ],
            pending: false,
          }))

          allThreads.push(...threads)

          this.post({
            type: "diffViewer.explainResult",
            threads,
            summary: last ? summary || "Explanation completed." : undefined,
            done: last,
          })
        } else if (last) {
          this.post({
            type: "diffViewer.explainResult",
            threads: [],
            summary: summary || "Explanation completed.",
            done: true,
          })
        }
      } finally {
        clearTimeout(timer)
      }
    }

    return { allThreads, summary }
  }

  /** Generate explanation via the SDK and post the result back to the webview */
  private async explainAll(): Promise<void> {
    // Reset session so a fresh one is created for each explain run
    this.explainSession = undefined
    const target = this.cachedDiffTarget ?? (await this.resolveLocalDiffTarget())
    if (!target) {
      this.log("explainAll: no diff target available")
      this.post({ type: "diffViewer.explainError", error: "No workspace or git repository found." })
      return
    }
    this.cachedDiffTarget = target

    try {
      this.log("explainAll: starting, target:", target.directory)
      
      const { validDiffs, firstCheck } = await this.getValidDiffsToExplain(target)
      this.log(`explainAll: combined patches from files (${firstCheck.length} chars)`)

      if (!firstCheck.trim()) {
        this.log("explainAll: no patches to explain (all filtered)")
        this.post({
          type: "diffViewer.explainResult",
          threads: [],
          summary: "No complex changes to explain.",
          done: true,
        })
        return
      }

      const root = getWorkspaceRoot()
      if (!root) {
        this.post({ type: "diffViewer.explainError", error: "No workspace root found." })
        return
      }

      const sessionContext = await this.initializeExplainSession(root)
      
      const { allThreads, summary } = await this.processExplainBatches(validDiffs, sessionContext, root, this.explainSession!)

      this.saveExplanations(allThreads, summary)
    } catch (err) {
      const msg = getErrorMessage(err)
      this.log(`Failed to explain changes:`, msg)
      this.explainSession = undefined
      this.post({ type: "diffViewer.explainError", error: msg })
    }
  }

  private async replyToThread(threadId: string, text: string): Promise<void> {
    if (!this.explainSession) {
      this.post({
        type: "diffViewer.threadReply",
        threadId,
        message: {
          id: Math.random().toString(36).substring(2, 9),
          author: "ai",
          text: "⚠️ Review session has expired. Please initiate a new explanation.",
          timestamp: Date.now(),
        },
      })
      return
    }

    try {
      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root) {
        throw new Error("No workspace root found.")
      }

      const prompt = [
        `The user replied to your explanation (thread ${threadId}):`,
        `"${text}"`,
        "",
        "Reply concisely. If they ask for clarification, explain in more detail.",
        "Stay focused on explaining the code — do not suggest changes.",
        "Return ONLY plain text, no JSON.",
      ].join("\n")

      const res = await client.session.prompt(
        {
          sessionID: this.explainSession,
          directory: root,
          agent: "explainer",
          parts: [{ type: "text", text: prompt }],
        },
        { throwOnError: true },
      )

      const part = res.data?.parts?.find((p: any) => p.type === "text")
      if (part && "text" in part) {
        this.post({
          type: "diffViewer.threadReply",
          threadId,
          message: {
            id: Math.random().toString(36).substring(2, 9),
            author: "ai",
            text: part.text.trim(),
            timestamp: Date.now(),
          },
        })
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      this.log(`Failed to reply:`, msg)
      // Send an empty AI reply to clear the pending state
      this.post({
        type: "diffViewer.threadReply",
        threadId,
        message: {
          id: Math.random().toString(36).substring(2, 9),
          author: "ai",
          text: `⚠️ Failed to reply: ${msg}`,
          timestamp: Date.now(),
        },
      })
    }
  }

  private async startThread(
    threadId: string,
    file: string,
    line: number,
    endLine: number | undefined,
    text: string,
    side?: "left" | "right",
  ): Promise<void> {
    try {
      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root) {
        throw new Error("No workspace root found.")
      }

      if (!this.explainSession) {
        const { data } = await client.session.create({ directory: root }, { throwOnError: true })
        this.explainSession = data.id
        this.connectionService.hideSession(data.id)
      }

      const prompt = [
        `You are an expert code explainer. The user is asking a question about a specific part of the code in the diff.`,
        `File: ${file}`,
        `Line: ${endLine !== undefined ? `${line}-${endLine}` : line}${side ? ` (${side === "left" ? "deletions" : "additions"} side)` : ""}`,
        `Question:`,
        `"${text}"`,
        ``,
        `Please reply directly to the user's question. Provide your answer in markdown format. Do NOT wrap your answer in JSON.`,
      ].join("\n")

      const res = await client.session.prompt(
        {
          sessionID: this.explainSession,
          directory: root,
          agent: "explainer",
          parts: [{ type: "text", text: prompt }],
        },
        { throwOnError: true },
      )

      const part = res.data?.parts?.find((p: any) => p.type === "text")
      if (part && "text" in part) {
        this.post({
          type: "diffViewer.threadReply",
          threadId,
          message: {
            id: Math.random().toString(36).substring(2, 9),
            author: "ai",
            text: part.text.trim(),
            timestamp: Date.now(),
          },
        })
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      this.log(`Failed to start thread:`, msg)

      this.post({
        type: "diffViewer.threadReply",
        threadId,
        message: {
          id: Math.random().toString(36).substring(2, 9),
          author: "ai",
          text: `⚠️ Failed to start thread: ${msg}`,
          timestamp: Date.now(),
        },
      })
    }
  }

  private async revertFile(file: string): Promise<void> {
    const target = this.cachedDiffTarget ?? (await this.resolveLocalDiffTarget())
    if (!target) {
      this.post({
        type: "diffViewer.revertFileResult",
        file,
        status: "error",
        message: "Could not resolve diff target",
      })
      return
    }

    try {
      const diff = new WorktreeDiffClient(this.connectionService.getClient(), this.gitOps, (...args) =>
        this.log(...args),
      )
      const result = await diff.revertFile(target, file)
      this.post({
        type: "diffViewer.revertFileResult",
        file,
        status: result.ok ? "success" : "error",
        message: result.message,
      })
      if (result.ok) void this.pollDiff()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log("Failed to revert file:", message)
      this.post({ type: "diffViewer.revertFileResult", file, status: "error", message })
    }
  }

  private async resolveLocalDiffTarget(): Promise<DiffTarget | undefined> {
    return await resolveLocalDiffTarget(this.gitOps, (...args) => this.log(...args), getWorkspaceRoot())
  }

  private async initialFetch(): Promise<void> {
    if (this.sessionId) {
      return this.fetchSessionDiff()
    }
    this.post({ type: "diffViewer.loading", loading: true })

    try {
      const target = await this.resolveLocalDiffTarget()
      if (!target) {
        this.post({ type: "diffViewer.diffs", diffs: [] })
        return
      }

      this.cachedDiffTarget = target

      this.log("initialFetch: fetching diffs locally...")
      const diffs = await diffSummary(this.gitOps, target.directory, target.baseBranch, (...args) => this.log(...args))

      this.lastDiffHash = hashFileDiffs(diffs)

      this.log(`Initial diff: ${diffs.length} file(s)`)
      this.post({ type: "diffViewer.diffs", diffs })

      // Restore cached explanations if the diff hash hasn't changed since they were generated
      this.restoreExplanationsIfCached()
      // Send branch name so webview can show/hide "Explain Branch Changes"
      this.post({ type: "diffViewer.branch", branch: target.baseBranch })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log("Failed to fetch initial diff:", message)
      this.post({ type: "diffViewer.diffs", diffs: [] })
    } finally {
      this.post({ type: "diffViewer.loading", loading: false })
    }
  }

  private async fetchSessionDiff(): Promise<void> {
    this.post({ type: "diffViewer.loading", loading: true })
    try {
      const client = this.connectionService.getClient()
      if (!client) {
        this.post({ type: "diffViewer.diffs", diffs: [] })
        return
      }
      const root = getWorkspaceRoot() || ""
      const { data } = await client.session.diff({
        sessionID: this.sessionId!,
        directory: root,
      })
      this.sessionPatches.clear()
      const diffs = (data ?? []).map((d) => {
        if (d.patch) this.sessionPatches.set(d.file, d.patch)
        return {
          file: d.file,
          patch: "",
          before: "",
          after: "",
          additions: d.additions,
          deletions: d.deletions,
          status: d.status,
          summarized: true as const,
        }
      })
      this.lastDiffHash = hashFileDiffs(diffs)
      this.post({ type: "diffViewer.diffs", diffs })
      this.post({ type: "diffViewer.mode", mode: "session" })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log("Failed to fetch session diff:", message)
      this.post({ type: "diffViewer.diffs", diffs: [] })
    } finally {
      this.post({ type: "diffViewer.loading", loading: false })
    }
  }

  private async handleSessionRequestDiff(file: string): Promise<void> {
    try {
      const root = getWorkspaceRoot()
      if (!root) return
      const patch = this.sessionPatches.get(file)
      if (!patch) {
        this.log(`handleSessionRequestDiff: no patch for ${file}`)
        return
      }
      const full = path.join(root, file)
      const after = await fs.readFile(full, "utf-8").catch(() => "")
      const parsed = parsePatch(patch)
      const reversed = parsed.length > 0 ? reversePatch(parsed[0]!) : undefined
      const before = reversed ? applyPatch(after, reversed) : ""
      this.post({
        type: "diffViewer.diffFile",
        file,
        diff: {
          file,
          patch,
          before: typeof before === "string" ? before : "",
          after,
          additions: 0,
          deletions: 0,
          status: !before ? "added" : !after ? "deleted" : "modified",
          summarized: false,
        },
      })
    } catch (err) {
      this.log(`Failed to fetch session diff for ${file}:`, err)
    }
  }

  private async pollDiff(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      if (this.sessionId) {
        await this.fetchSessionDiff()
        return
      }

      const target = this.cachedDiffTarget
      if (!target) {
        await this.initialFetch()
        return
      }

      const diffs = await diffSummary(this.gitOps, target.directory, target.baseBranch, (...args) => this.log(...args))

      const hash = hashFileDiffs(diffs)

      if (hash === this.lastDiffHash) return
      this.lastDiffHash = hash
      this.post({ type: "diffViewer.diffs", diffs })

      // Diff changed — invalidate cached explanations since they're stale
      const cache = this.loadExplanations()
      if (cache) {
        this.log("pollDiff: diff hash changed, clearing cached explanations")
        this.clearExplanations()
        this.post({ type: "diffViewer.clearExplanations" })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log("Failed to poll diff:", message)
    } finally {
      this.polling = false
    }
  }

  private startDiffPolling(): void {
    this.stopDiffPolling()
    this.lastDiffHash = undefined
    this.cachedDiffTarget = undefined

    void this.initialFetch().then(() => {
      if (!this.panel) return
      this.diffInterval = setInterval(() => {
        void this.pollDiff()
      }, 5000)
    })
  }

  private stopDiffPolling(): void {
    if (this.diffInterval) {
      clearInterval(this.diffInterval)
      this.diffInterval = undefined
    }

    this.lastDiffHash = undefined
    this.cachedDiffTarget = undefined
    this.polling = false
  }

  private post(message: Record<string, unknown>): void {
    if (this.panel?.webview) void this.panel.webview.postMessage(message)
  }

  private getHtml(webview: vscode.Webview): string {
    return buildWebviewHtml(webview, {
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "diff-viewer.js")),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "diff-viewer.css")),
      iconsBaseUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "assets", "icons")),
      title: this.sessionId ? "Session Changes" : "Changes",
      port: this.connectionService.getServerInfo()?.port,
      extraStyles: "#root { display: flex; flex-direction: column; }",
    })
  }

  public dispose(): void {
    this.stopDiffPolling()
    if (this.explainSession) {
      this.connectionService.unhideSession(this.explainSession)
      const root = getWorkspaceRoot()
      if (root) {
        this.connectionService
          .getClient()
          ?.session.delete({ sessionID: this.explainSession, directory: root })
          .catch((err: unknown) => this.log("Failed to clean up explain session:", err))
      }
      this.explainSession = undefined
    }
    this.gitOps.dispose()
    this.panel?.dispose()
    this.outputChannel.dispose()
  }
}
