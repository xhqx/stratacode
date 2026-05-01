import * as vscode from "vscode"
import { StrataProvider } from "../../StrataProvider"

export class MemoryExtractor {
  private extracting = false
  private lastHash: string | null = null

  constructor(private readonly provider: StrataProvider) {}

  private async repoCommit(): Promise<string | undefined> {
    const extension = vscode.extensions.getExtension("vscode.git")
    if (!extension) return undefined
    const api = extension.isActive ? extension.exports?.getAPI(1) : (await extension.activate())?.getAPI(1)
    return api?.repositories?.[0]?.state.HEAD?.commit
  }

  /** Create an ephemeral session, run the prompt, then delete the session. */
  private async run(dir: string, prompt: string): Promise<void> {
    const client = this.provider.client
    if (!client) return

    const res = await client.session.create({ workspace: dir, title: "Memory Extraction Task" })
    if (!res.data) return
    const sid = res.data.id

    try {
      await client.session.prompt({
        sessionID: sid,
        parts: [{ type: "text", text: prompt }],
        agent: "memory_extractor",
      })
    } finally {
      await client.session.delete({ sessionID: sid, directory: dir })
        .catch(err => console.warn("[Strata New] MemoryExtractor: session cleanup failed:", err))
    }
  }

  public async analyze(hash: string): Promise<void> {
    if (this.extracting) return

    const config = this.provider.currentConfig
    if (!config?.project_memory?.enabled) return

    const current = await this.repoCommit()
    if (!current || current === this.lastHash) return

    if (!this.lastHash) {
      this.lastHash = current
      return
    }

    this.extracting = true
    const previous = this.lastHash
    this.lastHash = current

    try {
      const dir = this.provider.getWorkspaceDirectoryPublic()
      if (!dir) return

      const max = config?.project_memory?.max_commits ?? 10
      const prompt = `Please analyze the git history and diff from commit ${previous} to ${current} (max ${max} commits). 
Identify any new architectural decisions, coding rules, or significant contextual changes.
If found, write them to .stratacode/memory/ using your available tools.
Only document systemic rules and architectural migrations. Ignore trivial bug fixes or feature additions.`

      await this.run(dir, prompt)
    } catch (err) {
      console.error("[Strata New] MemoryExtractor: Failed to analyze commits:", err)
    } finally {
      this.extracting = false
    }
  }
}
