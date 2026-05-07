import { createContext, useContext, createSignal, onCleanup, createEffect } from "solid-js"
import type { ParentComponent, Accessor } from "solid-js"
import { useVSCode } from "./vscode"
import type { ExtensionMessage } from "../types/messages"

export interface WorkerRuntimeStatus {
  activeWorkers: number
  lastTasks: Array<{ id: string; worker: string; status: string; time: string }>
}

interface WorkerContextValue {
  status: Accessor<WorkerRuntimeStatus>
}

const initial: WorkerRuntimeStatus = {
  activeWorkers: 0,
  lastTasks: [],
}

const WorkerContext = createContext<WorkerContextValue>()

export const WorkerProvider: ParentComponent = (props) => {
  const vscode = useVSCode()
  const [status, setStatus] = createSignal<WorkerRuntimeStatus>(initial)

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "workerRuntimeStatusLoaded") return
    setStatus(message.status)
  })

  onCleanup(unsubscribe)

  createEffect(() => {
    vscode.postMessage({ type: "requestWorkerRuntimeStatus" })
  })

  return <WorkerContext.Provider value={{ status }}>{props.children}</WorkerContext.Provider>
}

export function useWorker(): WorkerContextValue {
  const context = useContext(WorkerContext)
  if (!context) {
    throw new Error("useWorker must be used within a WorkerProvider")
  }
  return context
}
