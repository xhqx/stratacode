import * as vscode from "vscode"
import type { StrataConnectionService } from "../services/cli-backend/connection-service"
import type { PlanningTask, PlanningStatus } from "./types"
import { hasCycle, isReady } from "./planning-validation"

export interface PlanningServiceOptions {
  context: vscode.ExtensionContext
  connectionService: StrataConnectionService
  postToSidebar: (message: any) => void
}

export class PlanningService {
  private context: vscode.ExtensionContext
  private connectionService: StrataConnectionService
  private postToSidebar: (message: any) => void
  private tasks: PlanningTask[] = []
  private unsubscribeStatus: (() => void) | null = null

  constructor(options: PlanningServiceOptions) {
    this.context = options.context
    this.connectionService = options.connectionService
    this.postToSidebar = options.postToSidebar

    this.load()
    this.setupListeners()
  }

  public dispose() {
    if (this.unsubscribeStatus) {
      this.unsubscribeStatus()
    }
  }

  private load() {
    const stored = this.context.globalState.get<PlanningTask[]>("planningTasks")
    if (Array.isArray(stored)) {
      this.tasks = stored
    } else {
      this.tasks = []
    }
    // Update any "planned" tasks to "ready" if they are ready on load
    let changed = false
    const now = new Date()
    for (const t of this.tasks) {
      if (t.status === "planned" && isReady(t, this.tasks, now)) {
        t.status = "ready"
        changed = true
      }
    }
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
        const props = event.properties as any
        const sessionId = props.sessionID
        const status = props.status
        
        if (sessionId && status) {
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
    if (opts.dependsOn && opts.dependsOn.length > 0) {
      if (hasCycle(this.tasks, id, opts.dependsOn)) {
        this.postToSidebar({
          type: "planningDispatchResult",
          taskId: id,
          success: false,
          error: "Circular dependency detected",
        })
        return
      }
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

  public update(id: string, updates: Partial<Omit<PlanningTask, "id" | "created" | "sessionID" | "worktreeID" | "dispatchedAt" | "completedAt" | "error">>) {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) return

    // Cycle check if dependencies are being updated
    if (updates.dependsOn) {
      if (hasCycle(this.tasks, id, updates.dependsOn)) {
        this.postToSidebar({
          type: "planningDispatchResult",
          taskId: id,
          success: false,
          error: "Circular dependency detected",
        })
        return
      }
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

    if (task.status !== "planned" && task.status !== "ready" && task.status !== "failed" && task.status !== "needs_review") {
      this.postToSidebar({ type: "planningDispatchResult", taskId: id, success: false, error: "Task is already running or done" })
      return
    }

    try {
      const client = await this.connectionService.getClientAsync()
      const workspaceFolders = vscode.workspace.workspaceFolders
      const root = workspaceFolders?.[0]?.uri.fsPath
      if (!root) throw new Error("No workspace folder open")

      // 1. Create Session
      const { data: session, error: createError } = await client.session.create({ directory: root }, { throwOnError: false })
      if (createError || !session) {
        throw new Error(`Failed to create session: ${String(createError)}`)
      }

      // 2. Dispatch Prompt
      const parts = [{ type: "text" as const, text: task.prompt }]
      const { error: promptError } = await client.session.promptAsync({
        sessionID: session.id,
        directory: root,
        parts,
        agent: task.agent,
        model: task.providerID && task.modelID ? { providerID: task.providerID, modelID: task.modelID } : undefined,
      }, { throwOnError: false })

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
    
    // Evaluate readiness of dependent tasks
    const now = new Date()
    let changed = true // since we changed the task status
    for (const t of this.tasks) {
      if (t.status === "planned" && t.dependsOn?.includes(id)) {
        if (isReady(t, this.tasks, now)) {
          t.status = "ready"
        }
      }
    }
    
    if (changed) this.save()
  }
}
