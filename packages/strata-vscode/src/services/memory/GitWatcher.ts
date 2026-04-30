import * as vscode from "vscode"
import { MemoryExtractor } from "./MemoryExtractor"
import { StrataProvider } from "../../StrataProvider"

export class GitWatcher {
  private extractor: MemoryExtractor
  private disposables: vscode.Disposable[] = []

  constructor(private readonly provider: StrataProvider) {
    this.extractor = new MemoryExtractor(provider)
    this.init()
  }

  private async init() {
    try {
      const extension = vscode.extensions.getExtension("vscode.git")
      if (!extension) return

      const api = extension.isActive ? extension.exports?.getAPI(1) : (await extension.activate())?.getAPI(1)
      if (!api) return

      api.onDidOpenRepository(this.setupRepo, this, this.disposables)
      api.repositories.forEach((repo: any) => this.setupRepo(repo))
    } catch (e) {
      console.warn("[Strata New] GitWatcher initialization failed:", e)
    }
  }

  private setupRepo(repo: any) {
    if (!repo?.state) return
    
    // Subscribe to state changes (includes HEAD changes like checkout and pull)
    this.disposables.push(
      repo.state.onDidChange(() => {
        const currentHash = repo.state.HEAD?.commit
        if (currentHash) {
          this.extractor.analyzeCommits(currentHash)
        }
      })
    )
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }
}
