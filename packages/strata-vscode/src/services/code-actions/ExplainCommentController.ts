import * as vscode from "vscode"
import type { StrataProvider } from "../../StrataProvider"
import { GitOps } from "../../agent-manager/GitOps"
import { getWorkspaceRoot, resolveLocalDiffTarget } from "../../review-utils"
import { getErrorMessage } from "../../strata-provider-utils"

const CACHE_TTL_MS = 90 * 60 * 1000 // 90 minutes

interface CachedExplanation {
  text: string
  hash: string
  timestamp: number
}

export class ExplainCommentController implements vscode.Disposable {
  private controller: vscode.CommentController
  private threadMap = new Map<string, vscode.CommentThread>()
  private cache = new Map<string, CachedExplanation>()
  private gitOps: GitOps
  private summaries = new Map<string, string>() // fsPath -> brief summary
  private lensEmitter = new vscode.EventEmitter<void>()
  private lensRegistration: vscode.Disposable
  private explainSession: string | undefined

  constructor(private provider: StrataProvider) {
    this.controller = vscode.comments.createCommentController("strata-explain", "Strata AI Explain")
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument) => {
        return [new vscode.Range(0, 0, document.lineCount - 1, 0)]
      },
    }
    this.gitOps = new GitOps({ log: () => {} })

    // CodeLens at line 0: brief change summary before any code
    this.lensRegistration = vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      {
        onDidChangeCodeLenses: this.lensEmitter.event,
        provideCodeLenses: (doc) => {
          const summary = this.summaries.get(doc.uri.fsPath)
          if (!summary) return []
          return [
            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
              title: `💡 ${summary}`,
              command: "",
            }),
          ]
        },
      },
    )
  }

  /**
   * Explain only files currently visible in the editor — never batch all.
   * Each file is explained sequentially to respect rate limits.
   */
  public async explainAllNative(): Promise<void> {
    const root = getWorkspaceRoot()
    if (!root) return

    const target = await resolveLocalDiffTarget(this.gitOps, () => {}, root)
    if (!target) {
      vscode.window.showErrorMessage("Could not resolve diff target.")
      return
    }

    try {
      const client = this.provider.client
      if (!client) {
        vscode.window.showErrorMessage("Strata connection is not available.")
        return
      }

      const { data: diffs } = await client.worktree.diff(
        { directory: target.directory, base: target.baseBranch },
        { throwOnError: true },
      )

      if (diffs.length === 0) {
        vscode.window.showInformationMessage("No changes to explain.")
        return
      }

      // Only explain files the user currently has open in visible editors
      const visible = new Set(
        vscode.window.visibleTextEditors
          .map((e) => e.document.uri.fsPath.replace(root + "/", ""))
      )
      const targets = diffs.filter((d) => visible.has(d.file))

      if (targets.length === 0) {
        vscode.window.showInformationMessage("No open changed files to explain. Open a changed file first.")
        return
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating explanations...",
          cancellable: true,
        },
        async (progress, token) => {
          const total = targets.length
          for (const diff of targets) {
            if (token.isCancellationRequested) break
            progress.report({ increment: (1 / total) * 100, message: diff.file })
            await this.explainSingle(diff, root, target.baseBranch)
          }
        },
      )
    } catch (err) {
      console.error("Failed to explain changes natively:", err)
      vscode.window.showErrorMessage("Failed to generate explanations natively.")
    }
  }

  /**
   * Explains a single file by fetching its diff locally.
   * Optionally opens the native diff view.
   */
  public async explainSingleNative(file: string, openDiffView = true): Promise<void> {
    const root = getWorkspaceRoot()
    if (!root) return

    const target = await resolveLocalDiffTarget(this.gitOps, () => {}, root)
    if (!target) return

    if (openDiffView) {
      const fileUri = vscode.Uri.file(`${root}/${file}`)
      const tracked = await this.gitOps.execGit(["ls-files", "--error-unmatch", "--", file], root)
      if (tracked.code === 0) {
        const headUri = vscode.Uri.parse(`git:${file}?${JSON.stringify({ path: `${root}/${file}`, ref: "HEAD" })}`)
        vscode.commands.executeCommand("vscode.diff", headUri, fileUri, `${file} (Working Changes)`).then(
          undefined,
          () => {
            vscode.workspace.openTextDocument(fileUri).then(
              (doc) => vscode.window.showTextDocument(doc, { preview: true }),
            )
          },
        )
      } else {
        vscode.workspace.openTextDocument(fileUri).then(
          (doc) => vscode.window.showTextDocument(doc, { preview: true }),
        )
      }
    }

    try {
      const { diffFile } = await import("../../agent-manager/local-diff")
      const diff = await diffFile(this.gitOps, target.directory, target.baseBranch, file, () => {})
      if (!diff) return
      
      await this.explainSingle(diff, root, target.baseBranch)
    } catch (err) {
      console.error(`Failed to explain ${file} natively:`, err)
    }
  }

  /**
   * Explain a single file. Uses TTL cache when the diff content hasn't changed.
   */
  public async explainSingle(diff: any, root?: string, branch?: string): Promise<void> {
    const resolved = root ?? getWorkspaceRoot()
    if (!resolved) return

    const hash = this.hashDiff(diff)

    // Check cache
    const cached = this.cache.get(diff.file)
    if (cached && cached.hash === hash && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      // Reuse cached thread
      const existing = this.threadMap.get(diff.file)
      if (existing) return
      this.showThread(diff.file, resolved, cached.text)
      this.updateSummary(resolved, diff.file, cached.text)
      return
    }

    const client = this.provider.client
    if (!client) {
      console.warn(`ExplainCommentController: no client available for ${diff.file}`)
      return
    }

    const fileUri = vscode.Uri.file(`${resolved}/${diff.file}`)
    const patch = this.buildPatch(diff)
    const context = branch ? ` (changes relative to \`${branch}\`)` : ""

    const effort = vscode.workspace.getConfiguration("strata-code.new.explainer").get<string>("effort", "medium")
    let skipInstruction = ""
    if (effort === "low") {
      skipInstruction = "If this file's changes are simple or trivial, you MUST skip it. To skip, reply with the exact text `<SKIP>` and nothing else."
    } else if (effort === "medium") {
      skipInstruction = "If this file's changes are extremely obvious, you MUST skip it. To skip, reply with the exact text `<SKIP>` and nothing else."
    }

    const prompt = [
      `Briefly explain the changes in **${diff.file}**${context}.`,
      "Provide EXACTLY one comment for this file as a single short paragraph. Do NOT use lists. Keep your answer to 2–3 sentences: what changed and why it matters.",
      skipInstruction,
      "",
      "```diff",
      patch,
      "```",
    ].filter(Boolean).join("\n")

    // Dispose any existing thread before creating a new one
    const prev = this.threadMap.get(diff.file)
    if (prev) {
      prev.dispose()
      this.threadMap.delete(diff.file)
    }

    const thread = this.controller.createCommentThread(fileUri, new vscode.Range(0, 0, 0, 0), [
      {
        author: { name: "Strata AI", iconPath: vscode.Uri.parse("https://github.com/strata.png") },
        body: "Generating explanation...",
        mode: vscode.CommentMode.Preview,
      },
    ])
    thread.canReply = false
    this.threadMap.set(diff.file, thread)

    if (patch.split("\n").length > 500 || patch.length > 25000) {
      thread.comments = [
        {
          author: { name: "Strata AI" },
          body: new vscode.MarkdownString("Change too big to be analyzed."),
          mode: vscode.CommentMode.Preview,
        },
      ]
      return
    }

    try {
      let timeoutId: any
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Explanation timed out after 15s")), 15_000)
      })

      // Lazily create an ephemeral session for explanations
      if (!this.explainSession) {
        const { data } = await client.session.create({ directory: resolved }, { throwOnError: true })
        this.explainSession = data.id
      }

      const res = await Promise.race([
        client.session.prompt(
          {
            sessionID: this.explainSession,
            directory: resolved,
            agent: "explainer",
            parts: [{ type: "text", text: prompt }],
          },
          { throwOnError: true },
        ),
        timeout,
      ])

      clearTimeout(timeoutId)

      const textPart = res.data?.parts?.find((p: any) => p.type === "text")
      if (textPart && "text" in textPart) {
        const text = (textPart.text as string).trim()
        
        const cleanText = text.replace(/`/g, "")
        const isSkipped = /^\s*<?skip>?\s*$/i.test(cleanText)
        if (isSkipped) {
          thread.dispose()
          this.threadMap.delete(diff.file)
          return
        }

        thread.comments = [
          {
            author: { name: "Strata AI" },
            body: new vscode.MarkdownString(text),
            mode: vscode.CommentMode.Preview,
          },
        ]
        // Cache the result
        this.cache.set(diff.file, { text, hash, timestamp: Date.now() })
        this.updateSummary(resolved, diff.file, text)
      } else {
        thread.dispose()
        this.threadMap.delete(diff.file)
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      console.error(`Failed to explain ${diff.file}:`, msg)
      this.explainSession = undefined

      if (msg.toLowerCase().includes("model") || msg.toLowerCase().includes("agent")) {
        thread.dispose()
        this.threadMap.delete(diff.file)
        vscode.window.showErrorMessage(
          `Strata Explainer is restricted: ${msg}. Please select an agent/model in settings.`,
          "Open Settings"
        ).then((action) => {
          if (action === "Open Settings") {
            vscode.commands.executeCommand("strata-code.new.openSettings")
          }
        })
        return
      }

      thread.comments = [
        {
          author: { name: "Strata AI" },
          body: new vscode.MarkdownString(`*Failed to generate explanation:* ${msg}`),
          mode: vscode.CommentMode.Preview,
        },
      ]
    }
  }

  private showThread(file: string, root: string, text: string): void {
    const fileUri = vscode.Uri.file(`${root}/${file}`)
    const thread = this.controller.createCommentThread(fileUri, new vscode.Range(0, 0, 0, 0), [
      {
        author: { name: "Strata AI" },
        body: new vscode.MarkdownString(text),
        mode: vscode.CommentMode.Preview,
      },
    ])
    thread.canReply = false
    this.threadMap.set(file, thread)
  }

  public clearThreads(): void {
    for (const thread of this.threadMap.values()) {
      thread.dispose()
    }
    this.threadMap.clear()
    this.summaries.clear()
    this.lensEmitter.fire()
  }

  /** Invalidate cache entries whose diff content has changed */
  public invalidateStale(diffs: any[]): void {
    let changed = false
    for (const [file, entry] of this.cache) {
      const diff = diffs.find((d: any) => d.file === file)
      if (!diff || entry.hash !== this.hashDiff(diff)) {
        this.cache.delete(file)
        const thread = this.threadMap.get(file)
        if (thread) {
          thread.dispose()
          this.threadMap.delete(file)
        }
        // Remove stale summary
        const root = getWorkspaceRoot()
        if (root) {
          const key = vscode.Uri.file(`${root}/${file}`).fsPath
          if (this.summaries.delete(key)) changed = true
        }
      }
    }
    if (changed) this.lensEmitter.fire()
  }

  /** Update the CodeLens summary for a file */
  private updateSummary(root: string, file: string, text: string): void {
    const key = vscode.Uri.file(`${root}/${file}`).fsPath
    const summary = this.extractSummary(text)
    if (!summary) return
    this.summaries.set(key, summary)
    this.lensEmitter.fire()
  }

  /** Extract a brief one-line summary from the full explanation */
  private extractSummary(text: string): string {
    // Try "What changed" section first
    const match = text.match(/\*\*What changed\*\*:?\s*(.+?)(?:\n|$)/i)
    if (match) {
      const line = match[1].trim()
      return line.length > 140 ? line.slice(0, 137) + "..." : line
    }
    // Fallback: first non-empty line
    for (const line of text.split("\n")) {
      const trimmed = line.replace(/^[#*\-\s]+/, "").trim()
      if (trimmed.length > 10) {
        return trimmed.length > 140 ? trimmed.slice(0, 137) + "..." : trimmed
      }
    }
    return ""
  }

  private hashDiff(diff: any): string {
    return `${diff.file}:${diff.status}:${diff.additions}:${diff.deletions}:${diff.patch ?? ""}`
  }

  private buildPatch(diff: any): string {
    if (diff.patch) return diff.patch
    const before = diff.before.split("\n")
    const after = diff.after.split("\n")
    if (before.join("\n") === after.join("\n")) return ""
    const lines: string[] = []
    lines.push(`--- a/${diff.file}`)
    lines.push(`+++ b/${diff.file}`)
    const max = Math.max(before.length, after.length)
    for (let i = 0; i < max; i++) {
      const a = before[i]
      const b = after[i]
      if (a === b) {
        lines.push(` ${a ?? ""}`)
      } else {
        if (a !== undefined) lines.push(`-${a}`)
        if (b !== undefined) lines.push(`+${b}`)
      }
    }
    return lines.join("\n")
  }

  public dispose() {
    this.clearThreads()
    if (this.explainSession) {
      const root = getWorkspaceRoot()
      if (root) {
        this.provider.client?.session
          .delete({ sessionID: this.explainSession, directory: root })
          .catch((err: unknown) => console.warn("ExplainCommentController: session cleanup failed:", err))
      }
      this.explainSession = undefined
    }
    this.controller.dispose()
    this.lensRegistration.dispose()
    this.lensEmitter.dispose()
    this.gitOps.dispose()
  }
}
