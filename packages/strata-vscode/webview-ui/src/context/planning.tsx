import { createContext, createSignal, useContext, onMount, onCleanup, createMemo } from "solid-js"
import { useVSCode } from "./vscode"
import type { PlanningTask } from "../types/messages/planning"
import type { PlanningAddMessage, PlanningUpdateMessage } from "../types/messages/webview-messages"

interface PlanningContextType {
  tasks: () => PlanningTask[]
  add: (opts: Omit<PlanningAddMessage, "type">) => void
  update: (id: string, updates: PlanningUpdateMessage["updates"]) => void
  remove: (id: string) => void
  dispatch: (id: string) => void
  confirm: (id: string) => void
  hasCycle: (id: string, deps: string[]) => boolean
}

const PlanningContext = createContext<PlanningContextType>()

export function PlanningProvider(props: { children: any }) {
  const vscode = useVSCode()
  const [tasks, setTasks] = createSignal<PlanningTask[]>([])

  onMount(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data
      if (message?.type === "planningState" && Array.isArray(message.tasks)) {
        setTasks(message.tasks)
      } else if (message?.type === "planningDispatchResult") {
        if (!message.success) {
          // Could show a toast here
          console.error("[Strata] Planning dispatch failed:", message.error)
        }
      }
    }
    window.addEventListener("message", handler)
    vscode.postMessage({ type: "planning.requestState" })

    onCleanup(() => {
      window.removeEventListener("message", handler)
    })
  })

  const add = (opts: Omit<PlanningAddMessage, "type">) => {
    vscode.postMessage({ type: "planning.add", ...opts })
  }

  const update = (id: string, updates: PlanningUpdateMessage["updates"]) => {
    vscode.postMessage({ type: "planning.update", taskId: id, updates })
  }

  const remove = (id: string) => {
    vscode.postMessage({ type: "planning.remove", taskId: id })
  }

  const dispatch = (id: string) => {
    vscode.postMessage({ type: "planning.dispatch", taskId: id })
  }

  const confirm = (id: string) => {
    vscode.postMessage({ type: "planning.confirm", taskId: id })
  }

  // Client-side quick cycle check for UX feedback
  const hasCycle = (id: string, newDeps: string[]): boolean => {
    const currentTasks = tasks()
    const taskMap = new Map<string, string[]>()
    
    // Build adjacency list
    for (const t of currentTasks) {
      if (t.id === id) {
        taskMap.set(t.id, newDeps)
      } else {
        taskMap.set(t.id, t.dependsOn || [])
      }
    }

    if (!taskMap.has(id)) {
      taskMap.set(id, newDeps)
    }

    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true // cycle!
      if (visited.has(nodeId)) return false

      visited.add(nodeId)
      recursionStack.add(nodeId)

      const deps = taskMap.get(nodeId) || []
      for (const dep of deps) {
        if (dfs(dep)) return true
      }

      recursionStack.delete(nodeId)
      return false
    }

    // Check starting from the modified node is sufficient if graph was previously acyclic
    return dfs(id)
  }

  return (
    <PlanningContext.Provider
      value={{
        tasks,
        add,
        update,
        remove,
        dispatch,
        confirm,
        hasCycle,
      }}
    >
      {props.children}
    </PlanningContext.Provider>
  )
}

export function usePlanning() {
  const context = useContext(PlanningContext)
  if (!context) {
    throw new Error("usePlanning must be used within a PlanningProvider")
  }
  return context
}
