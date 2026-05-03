import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test"
import { AutocompleteRequestScheduler } from "../AutocompleteRequestScheduler"

describe("AutocompleteRequestScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it("should debounce requests", async () => {
    const scheduler = new AutocompleteRequestScheduler()
    let callCount = 0
    const task = async () => {
      callCount++
    }

    // Call multiple times quickly
    scheduler.schedule("const x = 1", "", task)
    scheduler.schedule("const x = 12", "", task)
    
    // Fast forward timer
    vi.advanceTimersByTime(350)
    await Promise.resolve() // flush microtasks
    
    // Only the last call should have been executed
    expect(callCount).toBe(1)
  })

  it("should execute immediately if no pending requests (leading edge)", async () => {
    const scheduler = new AutocompleteRequestScheduler()
    let callCount = 0
    const task = async () => {
      callCount++
    }

    scheduler.schedule("const x = 1", "", task)
    
    // The first call should execute without waiting for debounce
    expect(callCount).toBe(1)
  })

  it("should reuse pending requests for the same context", async () => {
    const scheduler = new AutocompleteRequestScheduler()
    
    let callCount = 0
    const task = async () => {
      callCount++
    }

    // Two identical requests (same hash) should result in one execution but both promises resolved
    const p1 = scheduler.schedule("const x = 1", "", task)
    const p2 = scheduler.schedule("const x = 1", "", task)
    
    await Promise.all([p1, p2])
    
    expect(callCount).toBe(1) // Task ran only once
  })

  it("should track latency and update delay", () => {
    const scheduler = new AutocompleteRequestScheduler()
    // It needs 10 samples to update
    for (let i = 0; i < 11; i++) {
      scheduler.recordLatency(150)
    }
    
    // After success, delay should drop
    const currentDelay = scheduler["debounceDelayMs"]
    expect(currentDelay).toBeLessThan(300)
    expect(currentDelay).toBeGreaterThanOrEqual(100)
  })
})
