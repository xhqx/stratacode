import * as vscode from "vscode"
import { MemoryExtractor } from "./MemoryExtractor"
import { StrataProvider } from "../../StrataProvider"
import { Logger } from "../../stratacode/logger"

interface GitRepository {
  state: {
    HEAD?: { commit?: string }
    onDidChange: (cb: () => void) => vscode.Disposable
  }
}

const DEBOUNCE_MS = 2000

export class GitWatcher {
  private extractor: MemoryExtractor
  private disposables: vscode.Disposable[] = []
  private repos = new WeakSet<GitRepository>()
  private debounce: ReturnType<typeof setTimeout> | undefined

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

      api.onDidOpenRepository(this.setup, this, this.disposables)
      api.repositories.forEach((repo: GitRepository) => this.setup(repo))
    } catch (e) {
      Logger.warn("GitWatcher", "GitWatcher initialization failed:", e)
    }
  }

  private setup(repo: GitRepository) {
    if (!repo?.state) return

    // Guard against duplicate listeners if the same repo fires onDidOpenRepository again
    if (this.repos.has(repo)) return
    this.repos.add(repo)

    // Subscribe to state changes (includes HEAD changes like checkout and pull)
    // Debounce to avoid flooding on rapid git operations
    this.disposables.push(
      repo.state.onDidChange(() => {
        const hash = repo.state.HEAD?.commit
        if (!hash) return

        clearTimeout(this.debounce)
        this.debounce = setTimeout(() => {
          void this.extractor.analyze(hash)
        }, DEBOUNCE_MS)
      })
    )
  }

  public dispose() {
    clearTimeout(this.debounce)
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }
}
