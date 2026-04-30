import { Effect, Deferred, Ref, Option } from "effect"
import { Provider } from "../provider"
import { ModelID, ProviderID } from "../provider/schema"
import { Log } from "../util"

const log = Log.Default

export interface PoolConfig {
  enabled?: boolean
  models: string[]
  max_concurrent?: number
  timeout?: number
}

interface Waiter {
  deferred: Deferred.Deferred<never, { providerID: ProviderID; modelID: ModelID }>
  createdAt: number
}

export class ModelPoolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for a model pool slot`)
    this.name = "ModelPoolTimeoutError"
  }
}

class ModelPoolTracker {
  // Number of active subagents using a specific model
  private activeCounts = new Map<string, number>()
  // Queue of subagents waiting for ANY model in their respective pools
  // Waiters are stored globally to process them in FIFO order when ANY slot frees up
  // Each waiter also carries the specific pool it is waiting on
  private waiters: { poolConfig: PoolConfig; resolve: (m: { providerID: ProviderID; modelID: ModelID }) => void }[] = []

  private getModelKey(providerID: string, modelID: string) {
    return `${providerID}/${modelID}`
  }

  // Find the model with the lowest active count that is below max_concurrent
  private findAvailableModel(poolConfig: PoolConfig): { providerID: ProviderID; modelID: ModelID } | undefined {
    const max = poolConfig.max_concurrent ?? 2

    let bestModel: { providerID: ProviderID; modelID: ModelID } | undefined
    let lowestCount = Infinity

    for (const modelStr of poolConfig.models) {
      const parsed = Provider.parseModel(modelStr)
      if (!parsed) continue

      const key = this.getModelKey(parsed.providerID, parsed.modelID)
      const count = this.activeCounts.get(key) ?? 0

      if (count < max && count < lowestCount) {
        lowestCount = count
        bestModel = parsed
      }
    }

    return bestModel
  }

  // For Effect-based caller: return model synchronously if available, otherwise return undefined
  tryAcquire(poolConfig: PoolConfig): { providerID: ProviderID; modelID: ModelID } | undefined {
    if (!poolConfig.enabled || !poolConfig.models.length) return undefined

    const bestModel = this.findAvailableModel(poolConfig)
    if (bestModel) {
      const key = this.getModelKey(bestModel.providerID, bestModel.modelID)
      this.activeCounts.set(key, (this.activeCounts.get(key) ?? 0) + 1)
      log.debug("acquired pool model", { model: key, active: this.activeCounts.get(key) })
      return bestModel
    }

    return undefined
  }

  // Register a waiter callback
  addWaiter(poolConfig: PoolConfig, resolve: (m: { providerID: ProviderID; modelID: ModelID }) => void) {
    this.waiters.push({ poolConfig, resolve })
    log.debug("added waiter to model pool", { waiters: this.waiters.length })
  }

  // Remove a waiter callback (e.g. on timeout/cancel)
  removeWaiter(resolve: (m: { providerID: ProviderID; modelID: ModelID }) => void) {
    const idx = this.waiters.findIndex((w) => w.resolve === resolve)
    if (idx !== -1) {
      this.waiters.splice(idx, 1)
      log.debug("removed waiter from model pool", { waiters: this.waiters.length })
    }
  }

  release(providerID: string, modelID: string) {
    const key = this.getModelKey(providerID, modelID)
    const current = this.activeCounts.get(key) ?? 0
    if (current > 0) {
      this.activeCounts.set(key, current - 1)
      log.debug("released pool model", { model: key, active: current - 1 })
    }

    // After releasing, check if any waiter can now be fulfilled
    // We check from the oldest waiter (FIFO)
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i]
      const available = this.findAvailableModel(waiter.poolConfig)
      if (available) {
        // Claim it for this waiter
        const availableKey = this.getModelKey(available.providerID, available.modelID)
        this.activeCounts.set(availableKey, (this.activeCounts.get(availableKey) ?? 0) + 1)
        log.debug("acquired pool model for waiter", {
          model: availableKey,
          active: this.activeCounts.get(availableKey),
        })

        // Remove from queue and resolve
        this.waiters.splice(i, 1)
        waiter.resolve(available)

        // Since we claimed a slot, we need to restart the search loop or just break if we only released one slot
        // Safe to break since one release = one slot freed.
        break
      }
    }
  }
}

const tracker = new ModelPoolTracker()

/**
 * Acquire a model from the pool.
 * Returns undefined if pool is disabled or empty.
 * Returns a model immediately if a slot is free.
 * Blocks (suspends the Effect) if all models are at max capacity.
 */
export const acquire = (poolConfig: PoolConfig | undefined | null) =>
  Effect.gen(function* () {
    if (!poolConfig?.enabled || !poolConfig.models.length) return undefined

    // 1. Try to acquire synchronously
    const syncResult = tracker.tryAcquire(poolConfig)
    if (syncResult) return syncResult

    // 2. If full, we must wait
    const timeoutSecs = poolConfig.timeout ?? 120
    const timeoutMs = timeoutSecs * 1000

    return yield* Effect.promise(() => {
      return new Promise<{ providerID: ProviderID; modelID: ModelID }>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined

        const resolveFn = (m: { providerID: ProviderID; modelID: ModelID }) => {
          if (timer) clearTimeout(timer)
          resolve(m)
        }

        tracker.addWaiter(poolConfig, resolveFn)

        timer = setTimeout(() => {
          tracker.removeWaiter(resolveFn)
          reject(new ModelPoolTimeoutError(timeoutMs))
        }, timeoutMs)
      })
    })
  })

/**
 * Release a model back to the pool.
 */
export const release = (providerID: string, modelID: string) =>
  Effect.sync(() => {
    tracker.release(providerID, modelID)
  })
