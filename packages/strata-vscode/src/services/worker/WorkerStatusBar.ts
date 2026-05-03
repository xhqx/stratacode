import * as vscode from "vscode"
import type { StrataProvider } from "../../StrataProvider"

export class WorkerStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem
  private activeWorkers = 0
  private lastTasks: Array<{ id: string; worker: string; status: string; time: string }> = []

  constructor(private provider: StrataProvider) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98)
    this.statusBarItem.command = "strata-code.new.workers.showStatus"
    this.statusBarItem.tooltip = "Strata Background Workers"
    this.updateDisplay()
  }

  public update(event: any) {
    if (event.type === "worker.started") {
      this.activeWorkers++
      this.lastTasks.unshift({
        id: event.properties.id,
        worker: event.properties.worker,
        status: "Running",
        time: new Date().toLocaleTimeString(),
      })
    } else if (event.type === "worker.completed" || event.type === "worker.failed") {
      this.activeWorkers = Math.max(0, this.activeWorkers - 1)
      const task = this.lastTasks.find((t) => t.id === event.properties.id)
      if (task) {
        task.status = event.type === "worker.completed" ? "Completed" : "Failed"
      } else {
        this.lastTasks.unshift({
          id: event.properties.id,
          worker: event.properties.worker,
          status: event.type === "worker.completed" ? "Completed" : "Failed",
          time: new Date().toLocaleTimeString(),
        })
      }
    }

    // keep last 20 tasks
    if (this.lastTasks.length > 20) {
      this.lastTasks = this.lastTasks.slice(0, 20)
    }

    this.updateDisplay()
  }

  public async showQuickPick() {
    const items = this.lastTasks.map((t) => ({
      label: `$(gear) ${t.worker}`,
      description: `${t.status} at ${t.time}`,
      detail: `Task ID: ${t.id}`,
    }))

    if (items.length === 0) {
      items.push({
        label: "No recent worker tasks",
        description: "",
        detail: "",
      })
    }

    await vscode.window.showQuickPick(items, {
      title: "Strata Background Workers",
      placeHolder: "Recent background tasks",
    })
  }

  public onConfigChanged() {
    this.updateDisplay()
  }

  private updateDisplay() {
    const config = this.provider.currentConfig
    const vscodeConfig = vscode.workspace.getConfiguration("strata-code.new")
    const vscodeWorkersEnabled = vscodeConfig.get<boolean>("workers.enabled", false)

    if (!config?.workers?.enabled && !vscodeWorkersEnabled) {
      this.statusBarItem.hide()
      return
    }

    if (this.activeWorkers > 0) {
      this.statusBarItem.text = `$(sync~spin) Workers (${this.activeWorkers})`
    } else {
      this.statusBarItem.text = `$(pass) Workers`
    }
    this.statusBarItem.show()
  }

  dispose() {
    this.statusBarItem.dispose()
  }
}
