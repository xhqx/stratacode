import { Effect, Fiber } from "effect"
import type { SessionID } from "@/session/schema"

type Entry = {
  status: "running" | "completed" | "error"
  session: SessionID
  parent: SessionID
  fiber: Fiber.Fiber<unknown, unknown>
  result?: string
  error?: string
  started: number
}

const registry = new Map<string, Entry>()

export namespace StrataTaskRegistry {
  export function register(id: string, entry: Entry): void {
    prune()
    registry.set(id, entry)
  }

  export function get(id: string): Entry | undefined {
    return registry.get(id)
  }

  export function complete(id: string, result: string): void {
    const entry = registry.get(id)
    if (entry && entry.status === "running") {
      entry.status = "completed"
      entry.result = result
    }
  }

  export function fail(id: string, error: string): void {
    const entry = registry.get(id)
    if (entry && entry.status === "running") {
      entry.status = "error"
      entry.error = error
    }
  }

  export function cancel(parent: SessionID): Effect.Effect<void> {
    return Effect.gen(function* () {
      const fibersToInterrupt: Fiber.Fiber<unknown, unknown>[] = []
      for (const entry of registry.values()) {
        if (entry.parent === parent && entry.status === "running") {
          fibersToInterrupt.push(entry.fiber)
        }
      }

      if (fibersToInterrupt.length > 0) {
        yield* Effect.forEach(fibersToInterrupt, (fiber) => Fiber.interrupt(fiber), {
          concurrency: "unbounded",
        })
      }
    })
  }

  export function prune(): void {
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    for (const [id, entry] of registry.entries()) {
      if (entry.status !== "running" && now - entry.started > fiveMinutes) {
        registry.delete(id)
      }
    }
  }
}
