import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { Provider } from "../../src/provider"
import * as ModelPool from "../../src/stratacode/model-pool"
import { ProviderID, ModelID } from "../../src/provider/schema"

describe("ModelPool", () => {
  const poolConfig = {
    enabled: true,
    models: ["openai/gpt-4", "anthropic/claude-3"],
    max_concurrent: 1,
    timeout: 1,
  }

  test("returns undefined if pool is disabled", async () => {
    const result = await Effect.runPromise(ModelPool.acquire({ ...poolConfig, enabled: false }))
    expect(result).toBeUndefined()
  })

  test("acquires least loaded model", async () => {
    // Acquire first model
    const m1 = await Effect.runPromise(ModelPool.acquire(poolConfig))
    expect(m1).toBeDefined()
    expect(m1?.providerID).toBe(ProviderID.make("openai"))
    expect(m1?.modelID).toBe(ModelID.make("gpt-4"))

    // Acquire second model since first is at capacity
    const m2 = await Effect.runPromise(ModelPool.acquire(poolConfig))
    expect(m2).toBeDefined()
    expect(m2?.providerID).toBe(ProviderID.make("anthropic"))
    expect(m2?.modelID).toBe(ModelID.make("claude-3"))

    // Cleanup
    await Effect.runPromise(ModelPool.release(m1!.providerID, m1!.modelID))
    await Effect.runPromise(ModelPool.release(m2!.providerID, m2!.modelID))
  })

  test("blocks and times out when all models are at max concurrency", async () => {
    // Exhaust the pool
    const m1 = await Effect.runPromise(ModelPool.acquire(poolConfig))
    const m2 = await Effect.runPromise(ModelPool.acquire(poolConfig))

    let error: Error | undefined
    try {
      await Effect.runPromise(ModelPool.acquire(poolConfig))
    } catch (e) {
      error = e as Error
    }

    expect(error).toBeDefined()
    expect(error?.name).toBe("ModelPoolTimeoutError")

    // Cleanup
    await Effect.runPromise(ModelPool.release(m1!.providerID, m1!.modelID))
    await Effect.runPromise(ModelPool.release(m2!.providerID, m2!.modelID))
  })

  test("waiter is unblocked when a slot is released", async () => {
    // Exhaust the pool
    const m1 = await Effect.runPromise(ModelPool.acquire(poolConfig))
    const m2 = await Effect.runPromise(ModelPool.acquire(poolConfig))

    // Start a waiter
    const waiterPromise = Effect.runPromise(ModelPool.acquire(poolConfig))

    // Release a slot
    setTimeout(() => {
      Effect.runPromise(ModelPool.release(m1!.providerID, m1!.modelID))
    }, 50)

    // Waiter should resolve with the released model
    const m3 = await waiterPromise
    expect(m3).toBeDefined()
    expect(m3?.providerID).toBe(m1?.providerID)
    expect(m3?.modelID).toBe(m1?.modelID)

    // Cleanup
    await Effect.runPromise(ModelPool.release(m2!.providerID, m2!.modelID))
    await Effect.runPromise(ModelPool.release(m3!.providerID, m3!.modelID))
  })
})
