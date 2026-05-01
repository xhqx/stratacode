import * as vscode from "vscode"
import type { StrataProvider } from "../../StrataProvider"
import { GitOps } from "../../agent-manager/GitOps"
import { getWorkspaceRoot, resolveLocalDiffTarget } from "../../review-utils"
import { getErrorMessage } from "../../strata-provider-utils"
import { buildIndexedPatches, parseExplainResponse, shouldPreSkip } from "../../explain-skip"

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
    this.controller.options = { prompt: "Ask Strata AI..." }
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
   * Explains all changed files at once using the new batch JSON review model.
   * Creates native VS Code threads for each comment returned.
   */
  public async explainAllNative(): Promise<void> {
    const root = getWorkspaceRoot()
    if (!root) {
      vscode.window.showErrorMessage("Strata Code: Please open a workspace first.")
      return
    }

    const target = await resolveLocalDiffTarget(this.gitOps, () => {}, root)
    if (!target) return

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Strata AI: Reviewing Changes...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const { diffSummary, diffFile } = await import("../../agent-manager/local-diff")
          const diffs = await diffSummary(this.gitOps, target.directory, target.baseBranch)
          
          const effort = vscode.workspace.getConfiguration("strata-code.new.explainer").get<string>("effort", "medium")
          
          const validDiffs: { file: string, patch: string }[] = []
          for (const d of diffs) {
            if (d.generatedLike) continue
            
            const entry = await diffFile(this.gitOps, target.directory, target.baseBranch, d.file)
            if (!entry || !entry.patch) continue
            
            if (shouldPreSkip(entry.patch, effort)) continue

            validDiffs.push({ file: d.file, patch: entry.patch })
          }

          const { annotatedDiffs, lineMap } = buildIndexedPatches(validDiffs)

          if (!annotatedDiffs.trim()) {
            vscode.window.showInformationMessage("Strata AI: No complex changes to explain.")
            return
          }

          const client = this.provider.client
          if (!client) {
            vscode.window.showErrorMessage("Strata connection is not available.")
            return
          }
          
          if (!this.explainSession) {
            const { data } = await client.session.create({ directory: root }, { throwOnError: true })
            this.explainSession = data.id
            this.provider.hideSession(data.id)
          }

          const prompt = [
            "You are an expert code reviewer. Below are all changed files as unified diffs.",
            "",
            "IMPORTANT: Each changed line (+ or -) is prefixed with an ID in brackets, e.g., [1], [2].",
            "These IDs uniquely identify that specific changed line.",
            "",
            "Leave inline comments ONLY at lines where you see actual changes.",
            "Focus on:",
            "- Potential bugs or logic errors",
            "- Performance issues",
            "- Security concerns",
            "- Non-obvious design decisions that deserve explanation",
            "- Suggestions for improvement",
            "",
            "Do NOT comment on trivially obvious changes (renames, imports, formatting, version bumps).",
            "",
            "Respond with ONLY this JSON (no markdown fences, no extra text):",
            "{",
            "  \"summary\": \"Brief 1-2 sentence summary of the overall changeset\",",
            "  \"comments\": {",
            "    \"1\": \"Your comment for the change at ID [1]...\"",
            "  }",
            "}",
            "",
            "If a line number ID is skipped in your comments, that means you have no comment for it.",
            "If there is nothing worth commenting on, return: { \"summary\": \"...\", \"comments\": {} }",
            "",
            "--- DIFFS ---",
            annotatedDiffs,
          ].join("\n")

          let timer: ReturnType<typeof setTimeout> | undefined
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Explanation timed out after 60s")), 60_000)
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
              const raw = part.text.trim()
              const parsed = parseExplainResponse(raw, lineMap)
              
              if (parsed.summary) {
                // Attach the summary to the first file's CodeLens for now
                if (diffs.length > 0) {
                  const firstFile = vscode.Uri.joinPath(vscode.Uri.file(root), diffs[0].file).fsPath
                  this.summaries.set(firstFile, parsed.summary)
                  this.lensEmitter.fire()
                }
              }

              for (const comment of parsed.comments) {
                const uri = vscode.Uri.joinPath(vscode.Uri.file(root), comment.file)
                const line = Math.max(0, comment.line - 1)
                
                // Construct a deterministic ID for this thread
                const threadId = `${uri.fsPath}:${line}`
                
                let thread = this.threadMap.get(threadId)
                if (!thread) {
                  thread = this.controller.createCommentThread(
                    uri,
                    new vscode.Range(line, 0, line, 0),
                    [],
                  )
                  thread.canReply = true
                  this.threadMap.set(threadId, thread)
                }

                thread.comments = [...thread.comments, {
                  author: { name: "Strata AI" },
                  body: new vscode.MarkdownString(comment.text),
                  mode: vscode.CommentMode.Preview,
                }]
              }


            } else {
              vscode.window.showErrorMessage("Strata AI: Received invalid response.")
            }
          } finally {
            clearTimeout(timer)
          }
        } catch (err) {
          const msg = getErrorMessage(err)
          vscode.window.showErrorMessage(`Strata AI: Failed to explain changes: ${msg}`)
          this.explainSession = undefined
        }
      }
    )
  }

  public async replyToThread(reply: vscode.CommentReply): Promise<void> {
    const thread = reply.thread
    const text = reply.text
    
    // Add user's comment to the thread
    const userComment: vscode.Comment = {
      author: { name: "You" },
      body: new vscode.MarkdownString(text),
      mode: vscode.CommentMode.Preview,
    }
    thread.comments = [...thread.comments, userComment]

    const client = this.provider.client
    if (!client) {
      vscode.window.showErrorMessage("Strata connection is not available.")
      return
    }

    const root = getWorkspaceRoot()
    if (!root) return

    if (!this.explainSession) {
      const { data } = await client.session.create({ directory: root }, { throwOnError: true })
      this.explainSession = data.id
      this.provider.hideSession(data.id)
    }

    const file = vscode.workspace.asRelativePath(thread.uri)
    const line = thread.range ? thread.range.start.line + 1 : 0
    
    // Build context from previous messages
    const conversation = thread.comments.map((c: any) => `${c.author.name}: ${c.body.value}`).join("\n\n")

    const prompt = [
      `You are an expert code reviewer. The user is asking a follow-up question about your explanation of a code change.`,
      `File: ${file}`,
      `Line: ${line}`,
      `Thread so far:`,
      conversation,
      ``,
      `Please reply directly to the user's latest question. Provide your answer in markdown format. Do NOT wrap your answer in JSON.`
    ].join("\n")

    // Show a loading indicator by creating a temporary comment or using VS Code progress
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Strata AI: Thinking...", cancellable: false },
      async () => {
        try {
          const res = await client.session.prompt(
            {
              sessionID: this.explainSession!,
              directory: root,
              agent: "copilot", // Use copilot agent to return plain markdown
              parts: [{ type: "text", text: prompt }],
            },
            { throwOnError: true }
          )

          const part = res.data?.parts?.find((p: any) => p.type === "text")
          if (part && "text" in part) {
            const aiReply: vscode.Comment = {
              author: { name: "Strata AI" },
              body: new vscode.MarkdownString(part.text.trim()),
              mode: vscode.CommentMode.Preview,
            }
            thread.comments = [...thread.comments, aiReply]
          } else {
            vscode.window.showErrorMessage("Strata AI: Received invalid response.")
          }
        } catch (err) {
          const msg = getErrorMessage(err)
          vscode.window.showErrorMessage(`Strata AI: Failed to reply: ${msg}`)
        }
      }
    )
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
      this.provider.unhideSession(this.explainSession)
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
