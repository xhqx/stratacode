import * as vscode from "vscode"
import type { StrataProvider } from "../../StrataProvider"
import { getWorkspaceRoot } from "../../review-utils"
import { Logger } from "../../stratacode/logger"
import { isEnabled } from "../../stratacode/feature-gate"

const DENY = [
  /\.env.*/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /.*secret.*/i,
  /.*credentials.*/i,
  /\.lock$/i,
  /.*lock\.json$/i,
  /yarn\.lock$/i,
  /bun\.lockb$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /\.d\.ts$/i,
  /node_modules/,
  /\.git/,
  /dist\//,
  /build\//,
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.gif$/i,
  /\.svg$/i,
  /\.woff/i,
  /\.ttf$/i,
  /\.ico$/i,
  /\.mp[34]$/i,
]

export class WorkerWatcher implements vscode.Disposable {
  private disposable: vscode.Disposable
  private pendingFiles: Set<string> = new Set()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private provider: StrataProvider) {
    this.disposable = vscode.workspace.onDidSaveTextDocument((doc) => this.handleSave(doc))
  }

  private handleSave(doc: vscode.TextDocument) {
    const config = this.provider.currentConfig
    const enabled = config?.workers?.enabled || isEnabled("workers") || isEnabled("explainerWorker") || isEnabled("reviewerWorker")
    if (!enabled) return

    const fsPath = doc.uri.fsPath
    const isDenied = DENY.some((pattern) => pattern.test(fsPath))
    if (isDenied) return

    this.pendingFiles.add(fsPath)

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    const debounceMs = config?.workers?.debounce_ms ?? 5000
    this.debounceTimer = setTimeout(() => this.triggerWorkers(), debounceMs)
  }

  private triggerWorkers() {
    this.debounceTimer = null
    const files = Array.from(this.pendingFiles)
    this.pendingFiles.clear()

    if (files.length === 0) return

    const root = getWorkspaceRoot()
    if (!root) return

    const client = this.provider.client
    if (!client) return

    Logger.info("worker-watcher", "triggering background workers", { files: files.length })

    const autoExplain = vscode.workspace.getConfiguration("strata-code.new").get<boolean>("workers.autoExplain")

    // SDK client path: client.workers.trigger
    // The SDK generation creates `client.worker` or `client.workers` depending on operationID `workers.trigger` or `worker.trigger`.
    // We specified operationId: "worker.trigger" in routes.
    ;(client as any).worker?.trigger({ directory: root }, { files, autoExplain }).catch((err: any) => {
      Logger.warn("worker-watcher", "failed to trigger workers", { err })
    })
  }

  dispose() {
    this.disposable.dispose()
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
  }
}
