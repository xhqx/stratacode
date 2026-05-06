// stratacode_change - new file
import { Effect } from "effect"
import { Log } from "@/util"
import { Bus } from "@/bus"
import { Started, Completed, Failed } from "./events"
import * as Config from "@/config/config"
import { reviewWorker } from "./review"
import { explainerWorker } from "./explainer"
import { summarizerWorker } from "./summarizer"
import { docWorker } from "./doc-worker" // stratacode_change

const log = Log.create({ service: "worker:manager" })

export interface WorkerTask {
  id: string
  cwd: string
  worker: string
  payload: any
  retries: number
}

// Semaphore and debounce
const tasks = new Map<string, WorkerTask>()
const timers = new Map<string, NodeJS.Timeout>()
let running = 0

// We can define the worker registry
type WorkerFn = (cwd: string, payload: any) => Promise<any>
const registry = new Map<string, WorkerFn>()

export const registerWorker = (name: string, fn: WorkerFn) => {
  registry.set(name, fn)
}

// Register default workers
registerWorker("review_worker", reviewWorker)
registerWorker("explainer_worker", explainerWorker)
registerWorker("summarizer_worker", summarizerWorker)
registerWorker("doc_worker", docWorker) // stratacode_change

export const dispatch = async (cwd: string, worker: string, payload: any) => {
  try {
    const cfg = await Config.get()
    if (!cfg.workers?.enabled) return

    const debounceMs = cfg.workers.debounce_ms ?? 5000
    const key = `${cwd}:${worker}:${JSON.stringify(payload)}`

    if (timers.has(key)) {
      clearTimeout(timers.get(key)!)
    }

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        enqueue({ id: Math.random().toString(36).slice(2), cwd, worker, payload, retries: 0 })
      }, debounceMs),
    )
  } catch (err) {
    log.error("dispatch failed", { err })
  }
}

const enqueue = (task: WorkerTask) => {
  tasks.set(task.id, task)
  pump()
}

const pump = async () => {
  try {
    const cfg = await Config.get()
    const maxConcurrency = cfg.workers?.max_concurrency ?? 1

    while (running < maxConcurrency && tasks.size > 0) {
      const [id, task] = tasks.entries().next().value!
      tasks.delete(id)

      running++
      execute(task).finally(() => {
        running--
        pump()
      })
    }
  } catch (err) {
    log.error("pump failed", { err })
  }
}

const execute = async (task: WorkerTask) => {
  const start = Date.now()
  const fn = registry.get(task.worker)
  if (!fn) {
    log.error("worker not found", { worker: task.worker })
    return
  }

  Bus.publish(Started, { id: task.id, worker: task.worker, file: task.payload?.file }).catch(() => {})

  try {
    const result = await fn(task.cwd, task.payload)
    const duration = Date.now() - start
    Bus.publish(Completed, { id: task.id, worker: task.worker, duration, result }).catch(() => {})
  } catch (err) {
    log.error("worker failed", { worker: task.worker, err })
    const msg = err instanceof Error ? err.message : String(err)

    // Backoff and retry
    if (task.retries < 3) {
      task.retries++
      const backoff = Math.pow(2, task.retries) * 1000
      setTimeout(() => enqueue(task), backoff)
    } else {
      Bus.publish(Failed, { id: task.id, worker: task.worker, error: msg }).catch(() => {})
    }
  }
}
