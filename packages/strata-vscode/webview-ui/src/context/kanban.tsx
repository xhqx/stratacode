import { createContext, createSignal, useContext, createEffect, onMount, onCleanup, createMemo } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useVSCode } from "./vscode"
import { useSession } from "./session"
import type { KanbanTask, KanbanColumn } from "../types/messages/kanban"
import type { TodoItem } from "../types/messages/questions"

interface KanbanContextType {
  tasks: () => KanbanTask[]
  addTask: (title: string, description?: string) => void
  updateTask: (id: string, updates: Partial<KanbanTask>) => void
  deleteTask: (id: string) => void
  moveTask: (id: string, column: KanbanColumn) => void
  linkSession: (taskId: string, sessionID: string) => void
  layout: () => "vertical" | "horizontal"
  setLayout: (layout: "vertical" | "horizontal") => void
}

const KanbanContext = createContext<KanbanContextType>()

export function KanbanProvider(props: { children: any }) {
  const vscode = useVSCode()
  const session = useSession()

  // Manual tasks store
  const [manualTasks, setManualTasks] = createStore<KanbanTask[]>([])
  
  // Planned tasks store (read-only projection from PlanningService)
  const [plannedTasks, setPlannedTasks] = createSignal<KanbanTask[]>([])

  const [layout, setLayout] = createSignal<"vertical" | "horizontal">("vertical")

  // Load initial tasks
  onMount(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data
      if (message?.type === "kanbanTasksLoaded" && Array.isArray(message.tasks)) {
        setManualTasks(message.tasks)
      } else if (message?.type === "plannedKanbanTasks" && Array.isArray(message.tasks)) {
        setPlannedTasks(message.tasks)
      }
    }
    window.addEventListener("message", handler)
    vscode.postMessage({ type: "requestKanbanTasks" })

    onCleanup(() => {
      window.removeEventListener("message", handler)
    })
  })

  // Debounced save
  let saveTimeout: any
  createEffect(() => {
    // track manual tasks
    const tasks = JSON.parse(JSON.stringify(manualTasks))
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      vscode.postMessage({ type: "saveKanbanTasks", tasks })
    }, 500)
  })

  // Derive agent tasks from current session
  const agentTasks = createMemo<KanbanTask[]>(() => {
    const todos = session.todos()
    if (!todos || todos.length === 0) return []

    const sessionId = session.currentSessionID()

    return todos.map((todo: TodoItem) => {
      let column: KanbanColumn = "todo"
      if (todo.status === "in_progress") column = "progress"
      if (todo.status === "completed") column = "done"

      return {
        id: `agent-${todo.id}`,
        title: todo.content,
        column,
        source: "agent",
        sessionID: sessionId,
        created: new Date().toISOString(),
      }
    })
  })

  // Merged tasks
  const tasks = createMemo(() => {
    return [...plannedTasks(), ...agentTasks(), ...manualTasks]
  })

  const addTask = (title: string, description?: string) => {
    setManualTasks(
      produce((tasks) => {
        tasks.push({
          id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title,
          description,
          column: "todo",
          source: "manual",
          created: new Date().toISOString(),
        })
      }),
    )
  }

  const updateTask = (id: string, updates: Partial<KanbanTask>) => {
    if (id.startsWith("agent-") || id.startsWith("planned-")) return // Cannot update agent or planned tasks
    setManualTasks(
      (task) => task.id === id,
      produce((task) => {
        Object.assign(task, updates)
      }),
    )
  }

  const deleteTask = (id: string) => {
    if (id.startsWith("agent-") || id.startsWith("planned-")) return // Cannot delete agent or planned tasks
    setManualTasks((tasks) => tasks.filter((t) => t.id !== id))
  }

  const moveTask = (id: string, column: KanbanColumn) => {
    if (id.startsWith("agent-") || id.startsWith("planned-")) return // Agent and planned tasks move automatically
    setManualTasks(
      (task) => task.id === id,
      "column",
      column,
    )
  }

  const linkSession = (taskId: string, sessionID: string) => {
    if (taskId.startsWith("agent-") || taskId.startsWith("planned-")) return
    setManualTasks(
      (task) => task.id === taskId,
      "sessionID",
      sessionID,
    )
  }

  return (
    <KanbanContext.Provider
      value={{
        tasks,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        linkSession,
        layout,
        setLayout,
      }}
    >
      {props.children}
    </KanbanContext.Provider>
  )
}

export function useKanban() {
  const context = useContext(KanbanContext)
  if (!context) {
    throw new Error("useKanban must be used within a KanbanProvider")
  }
  return context
}
