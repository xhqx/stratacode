import * as vscode from "vscode"
import { StrataProvider } from "../../StrataProvider"

export class MemoryExtractor {
  private isExtracting = false
  private lastCommitHash: string | null = null

  constructor(private readonly provider: StrataProvider) {}

  public async analyzeCommits(newHash: string): Promise<void> {
    if (this.isExtracting) return
    
    // Check config
    const config = (this.provider as any).cachedConfigMessage?.config
    if (!config?.project_memory?.enabled) return
    
    // Check git extension
    const extension = vscode.extensions.getExtension("vscode.git")
    if (!extension) return
    
    const api = extension.isActive ? extension.exports?.getAPI(1) : (await extension.activate())?.getAPI(1)
    if (!api) return
    
    const repo = api.repositories?.[0]
    if (!repo) return
    
    const currentHash = repo.state.HEAD?.commit
    if (!currentHash || currentHash === this.lastCommitHash) return
    
    // If lastCommitHash is null, we just set it and don't extract (first run)
    if (!this.lastCommitHash) {
      this.lastCommitHash = currentHash
      return
    }

    const client = this.provider.getConnectionService().getClient()
    if (!client) return

    this.isExtracting = true
    const previousHash = this.lastCommitHash
    this.lastCommitHash = currentHash

    try {
      // Get the diff between previous and current
      const maxCommits = config?.project_memory?.max_commits ?? 10
      
      const workspaceDir = this.provider.getWorkspaceDirectory()
      if (!workspaceDir) return
      
      // Get the commit logs and diff using simple git command execution or use the commit diff
      // For simplicity, we trigger an agent prompt instructing it to analyze the diff of the recent commits
      const promptText = `Please analyze the git history and diff from commit ${previousHash} to ${currentHash} (max ${maxCommits} commits). 
Identify any new architectural decisions, coding rules, or significant contextual changes.
If found, write them to .stratacode/memory/ using your available tools.
Only document systemic rules and architectural migrations. Ignore trivial bug fixes or feature additions.`

      // Execute agent through the SDK session API
      // Since we don't have a specific UI session, we'll create a background session or just run a direct request
      // We can use client.session.create to create a temporary background session
      const createRes = await client.session.create({
        agent: "memory_extractor",
        workspace: workspaceDir,
        title: "Memory Extraction Task",
        project_uuid: "", // Use active project
      })

      if (createRes.data) {
        const sessionUuid = createRes.data.uuid
        
        // Push the prompt message
        await client.session.message({
          uuid: sessionUuid,
          content: promptText,
        })
      }
    } catch (err) {
      console.error("[Strata New] MemoryExtractor: Failed to analyze commits:", err)
    } finally {
      this.isExtracting = false
    }
  }
}
