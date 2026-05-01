import * as vscode from "vscode"
import type { StrataConnectionService } from "./services/cli-backend"
import { buildWebviewHtml } from "./utils"
import { GitOps } from "./agent-manager/GitOps"
import { WorktreeDiffClient, type DiffTarget } from "./worktree-diff-client"
import { diffSummary } from "./agent-manager/local-diff"
import {
  appendOutput,
  getWorkspaceRoot,
  hashFileDiffs,
  openWorkspaceRelativeFile,
  resolveLocalDiffTarget,
} from "./review-utils"
import { getErrorMessage } from "./strata-provider-utils"
import { buildIndexedPatches, parseExplainResponse, shouldPreSkip } from "./explain-skip"
// Using any to avoid rootDir TS6059 errors since agent-manager types live in webview-ui
// but are sent via the message protocol.
type ReviewThread = any


/**
 * DiffViewerProvider opens a full-screen diff viewer in an editor tab.
 * It shows the local workspace diff and forwards review comments back to the sidebar chat.
 */
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

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionService: StrataConnectionService,
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



  public openPanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One)
      return
    }

    const panel = vscode.window.createWebviewPanel(DiffViewerProvider.viewType, "Changes", vscode.ViewColumn.One, {
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
    const type = msg.type as string

    if (type === "webviewReady") {
      const config = vscode.workspace.getConfiguration("strata-code.new")
      this.post({
        type: "ready",
        vscodeLanguage: vscode.env.language,
        languageOverride: config.get<string>("language"),
        workspaceDirectory: getWorkspaceRoot(),
      })
      this.startDiffPolling()
      return
    }

    if (type === "diffViewer.sendComments" && Array.isArray(msg.comments)) {
      this.onSendComments?.(msg.comments, !!msg.autoSend)
      return
    }

    if (type === "diffViewer.close") {
      this.panel?.dispose()
      return
    }

    if (type === "diffViewer.setDiffStyle" && (msg.style === "unified" || msg.style === "split")) {
      return
    }

    if (type === "diffViewer.revertFile" && typeof msg.file === "string") {
      void this.revertFile(msg.file)
      return
    }

    if (type === "openFile" && typeof msg.filePath === "string") {
      this.openDiffView(msg.filePath, typeof msg.line === "number" ? msg.line : undefined)
      return
    }

    if (type === "diffViewer.explainAll") {
      void this.explainAll()
      return
    }

    if (type === "diffViewer.replyToThread" && typeof msg.threadId === "string" && typeof msg.text === "string") {
      void this.replyToThread(msg.threadId, msg.text)
      return
    }

    if (type === "diffViewer.requestDiff" && typeof msg.file === "string") {
      void this.handleRequestDiff(msg.file)
      return
    }
  }

  private async handleRequestDiff(file: string): Promise<void> {
    const target = this.cachedDiffTarget ?? (await this.resolveLocalDiffTarget())
    if (!target) return
    try {
      // Use dynamic import like others to ensure local-diff is available
      const { diffFile } = await import("./agent-manager/local-diff")
      const diff = await diffFile(this.gitOps, target.directory, target.baseBranch, file, (...args) => this.log(...args))
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
      const headUri = vscode.Uri.parse(`git:${file}?${JSON.stringify({ path: `${root}/${file}`, ref: "HEAD" })}`)
      vscode.commands.executeCommand("vscode.diff", headUri, uri, `${file} (Working Changes)`, options).then(
        undefined,
        () => {
          // Fallback if git: URI scheme fails
          vscode.workspace.openTextDocument(uri).then(
            (doc) => vscode.window.showTextDocument(doc, options),
          )
        },
      )
    } else {
      // Untracked / new file — just open it
      vscode.workspace.openTextDocument(uri).then(
        (doc) => vscode.window.showTextDocument(doc, options),
      )
    }
  }

  private explainSession: string | undefined

  /** Generate explanation via the SDK and post the result back to the webview */
  private async explainAll(): Promise<void> {
    const target = this.cachedDiffTarget ?? (await this.resolveLocalDiffTarget())
    if (!target) {
      this.log("explainAll: no diff target available")
      this.post({ type: "diffViewer.explainError", error: "No workspace or git repository found." })
      return
    }
    this.cachedDiffTarget = target

    try {
      this.log("explainAll: starting, target:", target.directory)
      // Re-fetch patches for all files locally to ensure we have the full content
      const { diffFile } = await import("./agent-manager/local-diff")
      const diffs = await diffSummary(this.gitOps, target.directory, target.baseBranch, (...args) => this.log(...args))
      this.log(`explainAll: ${diffs.length} file(s) found`)
      
      const effort = vscode.workspace.getConfiguration("strata-code.new.explainer").get<string>("effort", "medium")
      
      const validDiffs: { file: string, patch: string }[] = []
      
      for (const d of diffs) {
        if (d.generatedLike) continue
        
        const entry = await diffFile(this.gitOps, target.directory, target.baseBranch, d.file, (...args) => this.log(...args))
        if (!entry || !entry.patch) continue
        
        if (shouldPreSkip(entry.patch, effort)) continue

        validDiffs.push({ file: d.file, patch: entry.patch })
      }

      const { annotatedDiffs, lineMap } = buildIndexedPatches(validDiffs)

      this.log(`explainAll: combined patches from files (${annotatedDiffs.length} chars)`)

      if (!annotatedDiffs.trim()) {
        this.log("explainAll: no patches to explain (all filtered)")
        this.post({
          type: "diffViewer.explainResult",
          threads: [],
          summary: "No complex changes to explain."
        })
        return
      }

      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root) {
        this.post({ type: "diffViewer.explainError", error: "No workspace root found." })
        return
      }

      if (!this.explainSession) {
        this.log("explainAll: creating new session")
        const { data } = await client.session.create({ directory: root }, { throwOnError: true })
        this.explainSession = data.id
        this.connectionService.hideSession(data.id)
        this.log("explainAll: session created:", this.explainSession)
      }

      const prompt = [
        "You are an expert code explainer. Below are all changed files as unified diffs.",
        "",
        "IMPORTANT: Each changed line (+ or -) is prefixed with an ID in brackets, e.g., [1], [2].",
        "These IDs uniquely identify that specific changed line.",
        "",
        "Your job is to EXPLAIN what changed and why — help the developer understand the changeset.",
        "Leave inline comments ONLY at lines where you see actual changes.",
        "Focus on:",
        "- Non-obvious logic or algorithmic changes that benefit from explanation",
        "- Important side effects or behavioral changes",
        "- Key architectural decisions reflected in the code",
        "- Complex transformations or refactors that need context",
        "",
        "Do NOT:",
        "- Suggest improvements or propose code changes",
        "- Comment on trivially obvious changes (renames, imports, formatting, version bumps)",
        "- Leave review-style recommendations",
        "",
        "Each comment should clearly explain WHAT this change does and WHY it matters.",
        "",
        "Respond with ONLY this JSON (no markdown fences, no extra text):",
        "{",
        "  \"summary\": \"Brief 1-2 sentence summary of the overall changeset\",",
        "  \"comments\": {",
        "    \"1\": \"Your explanation for the change at ID [1]...\",",
        "    \"3\": \"Your explanation for the change at ID [3]...\"",
        "  }",
        "}",
        "",
        "If a line number ID is skipped in your comments, that means you have no comment for it.",
        "If there is nothing worth explaining, return: { \"summary\": \"...\", \"comments\": {} }",
        "",
        "--- DIFFS ---",
        annotatedDiffs,
      ].join("\n")

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Explanation timed out after 60s")), 60_000)
      })

      try {
        this.log("explainAll: sending prompt to AI...")
        const res = await Promise.race([
          client.session.prompt(
            {
              sessionID: this.explainSession,
              directory: root,
              agent: "explainer",
              parts: [{ type: "text", text: prompt }],
            },
            { throwOnError: true },
          ),
          timeout,
        ])
        this.log("explainAll: AI response received")

        const part = res.data?.parts?.find((p: any) => p.type === "text")
        if (part && "text" in part) {
          const raw = part.text.trim()
          const parsed = parseExplainResponse(raw, lineMap)

          const threads: ReviewThread[] = parsed.comments.map(c => ({
            id: Math.random().toString(36).substring(2, 9),
            file: c.file,
            side: c.side,
            line: c.line,
            messages: [{
              id: Math.random().toString(36).substring(2, 9),
              author: "ai",
              text: c.text,
              timestamp: Date.now()
            }],
            pending: false
          }))

          this.post({
            type: "diffViewer.explainResult",
            threads,
            summary: parsed.summary || "Explanation completed."
          })
        } else {
           this.post({ type: "diffViewer.explainError", error: "Received invalid response from the AI." })
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      this.log(`Failed to explain changes:`, msg)
      this.explainSession = undefined
      this.post({ type: "diffViewer.explainError", error: msg })
    }
  }

  private async replyToThread(threadId: string, text: string): Promise<void> {
    if (!this.explainSession) {
      this.post({ type: "diffViewer.explainError", error: "Review session has expired." })
      return
    }

    try {
      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root) return

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
            timestamp: Date.now()
          }
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
          timestamp: Date.now()
        }
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

  private async pollDiff(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
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
      title: "Changes",
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
        this.connectionService.getClient()?.session
          .delete({ sessionID: this.explainSession, directory: root })
          .catch((err: unknown) => this.log("Failed to clean up explain session:", err))
      }
      this.explainSession = undefined
    }
    this.gitOps.dispose()
    this.panel?.dispose()
    this.outputChannel.dispose()
  }
}
