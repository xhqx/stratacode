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
        autoExplain: config.get<boolean>("explainer.autoExplain", true),
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
      this.openDiffView(msg.filePath)
      return
    }

    if (type === "diffViewer.explainFile" && typeof msg.file === "string" && typeof msg.patch === "string") {
      const line = typeof msg.line === "number" ? msg.line : 1
      this.explainFile(msg.file, msg.patch, line)
      return
    }

    if (type === "diffViewer.explainAll") {
      this.triggerExplainAll()
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
  private async openDiffView(file: string): Promise<void> {
    const root = getWorkspaceRoot()
    if (!root) return
    const uri = vscode.Uri.file(`${root}/${file}`)

    // Check if the file is tracked by git
    const result = await this.gitOps.execGit(["ls-files", "--error-unmatch", "--", file], root)
    if (result.code === 0) {
      // Tracked file — open side-by-side diff against HEAD
      const headUri = vscode.Uri.parse(`git:${file}?${JSON.stringify({ path: `${root}/${file}`, ref: "HEAD" })}`)
      vscode.commands.executeCommand("vscode.diff", headUri, uri, `${file} (Working Changes)`).then(
        undefined,
        () => {
          // Fallback if git: URI scheme fails
          vscode.workspace.openTextDocument(uri).then(
            (doc) => vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true }),
          )
        },
      )
    } else {
      // Untracked / new file — just open it
      vscode.workspace.openTextDocument(uri).then(
        (doc) => vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true }),
      )
    }
  }

  private explainSession: string | undefined

  /** Generate explanation via the SDK and post the result back to the webview */
  private async explainFile(file: string, patch: string, line = 1): Promise<void> {
    try {
      if (patch.split("\n").length > 300 || patch.length > 15000) {
        this.post({ type: "diffViewer.explanationResult", file, line, text: "Change too big to be analyzed." })
        return
      }

      const client = this.connectionService.getClient()
      const root = getWorkspaceRoot()
      if (!root) return

      // Lazily create an ephemeral session for explanations
      if (!this.explainSession) {
        const { data } = await client.session.create({ directory: root }, { throwOnError: true })
        this.explainSession = data.id
      }

      const branch = this.cachedDiffTarget?.baseBranch
      const context = branch ? ` (branch: \`${branch}\`)` : ""

      const effort = vscode.workspace.getConfiguration("strata-code.new.explainer").get<string>("effort", "medium")
      let skipInstruction = ""
      if (effort === "low") {
        skipInstruction = "If this change is simple or trivial, you MUST skip it. To skip, reply with the exact text `<SKIP>` and nothing else."
      } else if (effort === "medium") {
        skipInstruction = "If this change is extremely obvious, you MUST skip it. To skip, reply with the exact text `<SKIP>` and nothing else."
      }

      const prompt = [
        `Briefly explain this change in **${file}** near line ${line}${context}.`,
        "Provide EXACTLY one comment for this change as a single short paragraph. Do NOT use lists. Answer in 1–2 sentences only: what changed and why.",
        skipInstruction,
        "",
        "```diff",
        patch,
        "```",
      ].filter(Boolean).join("\n")

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Explanation timed out after 30s")), 30_000)
      })

      try {
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

        const part = res.data?.parts?.find((p: any) => p.type === "text")
        if (part && "text" in part) {
          const text = part.text.trim()
          this.post({ type: "diffViewer.explanationResult", file, line, text })
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      this.log(`Failed to explain ${file}:`, msg)
      // Reset session on failure so next attempt creates a fresh one
      this.explainSession = undefined
      this.post({ type: "diffViewer.explanationResult", file, line, text: `*Failed to generate explanation:* ${msg}` })
    }
  }

  /** Trigger explain-all from the extension host (e.g. via command palette) */
  public triggerExplainAll(): void {
    this.post({ type: "diffViewer.triggerExplainAll" })
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
