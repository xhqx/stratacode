import * as vscode from "vscode"
import * as path from "node:path"
import type { StrataConnectionService } from "../services/cli-backend/connection-service"
import type { PlanningTask, PlanningStatus } from "./types"
import { hasCycle, isReady } from "./planning-validation"
import { MarkdownPlanWatcher } from "./MarkdownPlanWatcher"
import type { MarkdownTask } from "./markdown-parser"
import { Logger } from "../stratacode/logger"

import { isEnabled } from "../stratacode/feature-gate"

export interface PlanningServiceOptions {
  context: vscode.ExtensionContext
  connectionService: StrataConnectionService
  postToSidebar: (message: unknown) => void
}

export class PlanningService {
  private context: vscode.ExtensionContext
  private connectionService: StrataConnectionService
  private postToSidebar: (message: unknown) => void
  private tasks: PlanningTask[] = []
  private unsubscribeStatus: (() => void) | null = null
  private watcher: MarkdownPlanWatcher | null = null
  private configDisposable: vscode.Disposable | null = null

  constructor(options: PlanningServiceOptions) {
    this.context = options.context
    this.connectionService = options.connectionService
    this.postToSidebar = options.postToSidebar

    this.load()
    this.setupListeners()

    this.syncWatcherConfig()

    this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("strata-code.new.features.documentDrivenTasks")) {
        this.syncWatcherConfig()
      }
    })
  }

  private syncWatcherConfig() {
    const documentDriven = isEnabled("documentDrivenTasks")

    if (documentDriven && !this.watcher) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (root) {
        this.watcher = new MarkdownPlanWatcher(root, () => this.pushMarkdownPreview())
        // Immediately scan when enabled
        this.pushMarkdownPreview()
      }
    } else if (!documentDriven && this.watcher) {
      this.watcher.dispose()
      this.watcher = null
    }
  }

  public dispose() {
    if (this.unsubscribeStatus) {
      this.unsubscribeStatus()
    }
    if (this.configDisposable) {
      this.configDisposable.dispose()
    }
    this.watcher?.dispose()
  }

  private load() {
    const stored = this.context.globalState.get<PlanningTask[]>("planningTasks")
    if (Array.isArray(stored)) {
      this.tasks = stored
    } else {
      this.tasks = []
    }
    // Update any "planned" tasks to "ready" if they are ready on load
    const now = new Date()
    const changed = this.tasks.reduce((acc, t) => {
      if (t.status === "planned" && isReady(t, this.tasks, now)) {
        t.status = "ready"
        return true
      }
      return acc
    }, false)
    if (changed) this.save()
  }

  private async save() {
    await this.context.globalState.update("planningTasks", this.tasks)
    this.pushState()
    this.pushKanbanTasks()
  }

  public pushState() {
    this.postToSidebar({
      type: "planningState",
      tasks: this.tasks,
    })
  }

  public pushKanbanTasks() {
    const kanbanTasks = this.tasks
      .filter((t) => t.status !== "done") // Done tasks don't show in Kanban planned column
      .map((t) => ({
        id: `planned-${t.id}`,
        title: t.title,
        description: t.description,
        column: "planned",
        source: "planned",
        sessionID: t.sessionID,
        created: t.created,
      }))

    this.postToSidebar({
      type: "plannedKanbanTasks",
      tasks: kanbanTasks,
    })
  }

  private setupListeners() {
    // Listen for session status changes to move dispatched -> needs_review or failed
    this.unsubscribeStatus = this.connectionService.onEvent((event) => {
      if (event.type === "session.status" && event.properties) {
        const props = event.properties as Record<string, unknown>
        const sessionId = props.sessionID
        const status = props.status as { type: string } | undefined

        if (typeof sessionId === "string" && status) {
          const task = this.tasks.find((t) => t.sessionID === sessionId && t.status === "dispatched")

          if (task) {
            if (status.type === "idle") {
              task.status = "needs_review"
              task.completedAt = new Date().toISOString()
              this.save()
            } else if (status.type === "error" || status.type === "retry") {
              // Handle error if needed
            }
          }
        }
      }
    })
  }

  private validateDependencies(id: string, dependsOn?: string[]): boolean {
    if (!dependsOn || dependsOn.length === 0) return true
    if (hasCycle(this.tasks, id, dependsOn)) {
      this.postToSidebar({
        type: "planningDispatchResult",
        taskId: id,
        success: false,
        error: "Circular dependency detected",
      })
      return false
    }
    return true
  }

  public add(opts: {
    title: string
    description?: string
    prompt: string
    agent?: string
    providerID?: string
    modelID?: string
    startAt?: string
    deadline?: string
    duration?: number
    priority?: number
    dependsOn?: string[]
  }) {
    const id = `ptask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Validate dependencies
    if (!this.validateDependencies(id, opts.dependsOn)) {
      return
    }

    const newTask: PlanningTask = {
      id,
      title: opts.title,
      description: opts.description,
      status: "planned",
      created: new Date().toISOString(),
      startAt: opts.startAt,
      deadline: opts.deadline,
      duration: opts.duration,
      priority: opts.priority ?? 3,
      dependsOn: opts.dependsOn,
      prompt: opts.prompt,
      agent: opts.agent,
      providerID: opts.providerID,
      modelID: opts.modelID,
    }

    // Check if immediately ready
    if (isReady(newTask, this.tasks, new Date())) {
      newTask.status = "ready"
    }

    this.tasks.push(newTask)
    this.save()
  }

  public update(
    id: string,
    updates: Partial<
      Omit<PlanningTask, "id" | "created" | "sessionID" | "worktreeID" | "dispatchedAt" | "completedAt" | "error">
    >,
  ) {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) return

    // Cycle check if dependencies are being updated
    if (!this.validateDependencies(id, updates.dependsOn)) {
      return
    }

    Object.assign(task, updates)

    // Re-evaluate readiness if still planned
    if (task.status === "planned" && isReady(task, this.tasks, new Date())) {
      task.status = "ready"
    } else if (task.status === "ready" && !isReady(task, this.tasks, new Date())) {
      task.status = "planned"
    }

    this.save()
  }

  public remove(id: string) {
    this.tasks = this.tasks.filter((t) => t.id !== id)
    // Clean up dependencies in other tasks
    for (const t of this.tasks) {
      if (t.dependsOn) {
        t.dependsOn = t.dependsOn.filter((dep) => dep !== id)
      }
    }
    this.save()
  }

  public async dispatch(id: string) {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) {
      this.postToSidebar({ type: "planningDispatchResult", taskId: id, success: false, error: "Task not found" })
      return
    }

    if (
      task.status !== "planned" &&
      task.status !== "ready" &&
      task.status !== "failed" &&
      task.status !== "needs_review"
    ) {
      this.postToSidebar({
        type: "planningDispatchResult",
        taskId: id,
        success: false,
        error: "Task is already running or done",
      })
      return
    }

    try {
      const client = await this.connectionService.getClientAsync()
      const workspaceFolders = vscode.workspace.workspaceFolders
      const root = workspaceFolders?.[0]?.uri.fsPath
      if (!root) throw new Error("No workspace folder open")

      // 1. Create Session
      const { data: session, error: createError } = await client.session.create(
        { directory: root },
        { throwOnError: false },
      )
      if (createError || !session) {
        throw new Error(`Failed to create session: ${String(createError)}`)
      }

      // 2. Dispatch Prompt
      const parts = [{ type: "text" as const, text: task.prompt }]
      const { error: promptError } = await client.session.promptAsync(
        {
          sessionID: session.id,
          directory: root,
          parts,
          agent: task.agent,
          model: task.providerID && task.modelID ? { providerID: task.providerID, modelID: task.modelID } : undefined,
        },
        { throwOnError: false },
      )

      if (promptError) {
        throw new Error(`Failed to dispatch prompt: ${String(promptError)}`)
      }

      // 3. Update State
      task.status = "dispatched"
      task.sessionID = session.id
      task.dispatchedAt = new Date().toISOString()
      task.error = undefined

      this.save()

      this.postToSidebar({ type: "planningDispatchResult", taskId: id, success: true, sessionID: session.id })
    } catch (err) {
      task.status = "failed"
      task.error = err instanceof Error ? err.message : String(err)
      this.save()
      this.postToSidebar({ type: "planningDispatchResult", taskId: id, success: false, error: task.error })
    }
  }

  public confirm(id: string) {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) return

    task.status = "done"

    // Write back to markdown file if task originated from a plan document
    if (task.markdownFile && task.markdownLine && this.watcher) {
      this.watcher.writeBack(task.markdownFile, task.markdownLine, "x")
    }

    // Evaluate readiness of dependent tasks
    const now = new Date()
    for (const t of this.tasks) {
      if (t.status === "planned" && t.dependsOn?.includes(id)) {
        if (isReady(t, this.tasks, now)) {
          t.status = "ready"
        }
      }
    }

    this.save()
  }

  public async pushMarkdownPreview() {
    if (!this.watcher) return
    try {
      const pages = await this.watcher.scan()
      const tasks = pages.flatMap((p) =>
        p.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          file: t.file,
          line: t.line,
          group: t.group,
          checked: t.checked,
        })),
      )
      const pending = tasks.filter((t) => !t.checked).length
      const files = [...new Set(pages.map((p) => p.path))]

      this.postToSidebar({
        type: "markdownPlanPreview",
        pending,
        files,
        tasks,
      })
    } catch (err) {
      Logger.warn("PlanningService", "pushMarkdownPreview failed:", err)
    }
  }

  public async applyMarkdownTasks() {
    if (!this.watcher) return
    try {
      const pages = await this.watcher.scan()
      const parsed = pages.flatMap((p) => p.tasks)
      const ids = new Set(parsed.map((t) => t.id))

      // Remove markdown-sourced tasks that no longer exist in files
      this.tasks = this.tasks.filter((t) => !t.markdownFile || ids.has(t.id))

      // Upsert each parsed task
      for (const mt of parsed) {
        const existing = this.tasks.find((t) => t.id === mt.id && t.markdownFile)

        if (!existing) {
          this.tasks.push(this.markdownToPlanning(mt))
          continue
        }

        // Update metadata
        existing.title = mt.title
        existing.description = mt.description || existing.description
        existing.markdownLine = mt.line
        existing.markdownGroup = mt.group
        existing.priority = mt.meta.priority ?? existing.priority
        existing.agent = mt.meta.agent ?? existing.agent
        existing.providerID = mt.meta.provider ?? existing.providerID
        existing.modelID = mt.meta.model ?? existing.modelID
        if (mt.meta.depends) existing.dependsOn = mt.meta.depends
        if (mt.checked && existing.status !== "done") existing.status = "done"
      }

      await this.save()
    } catch (err) {
      Logger.warn("PlanningService", "applyMarkdownTasks failed:", err)
    }
  }

  private markdownToPlanning(mt: MarkdownTask): PlanningTask {
    return {
      id: mt.id,
      title: mt.title,
      description: mt.description || undefined,
      status: mt.checked ? "done" : "planned",
      created: new Date().toISOString(),
      priority: mt.meta.priority ?? 3,
      dependsOn: mt.meta.depends,
      prompt: mt.description || mt.title,
      agent: mt.meta.agent,
      providerID: mt.meta.provider,
      modelID: mt.meta.model,
      markdownFile: mt.file,
      markdownLine: mt.line,
      markdownGroup: mt.group,
    }
  }

  public openPlanFile(file?: string, line?: number) {
    if (!this.watcher) return
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return
    const target = file || path.join(root, ".strata", "plans", "index.md")
    this.watcher.openFile(target, line)
  }
}
