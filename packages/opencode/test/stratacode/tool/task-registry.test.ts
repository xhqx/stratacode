import { describe, it, expect, beforeEach } from "bun:test"
import { Effect, Fiber } from "effect"
import { StrataTaskRegistry } from "@/stratacode/tool/task-registry"
import { SessionID } from "@/session/schema"

describe("StrataTaskRegistry", () => {
  beforeEach(() => {
    // We cannot easily clear the registry directly since it's private to the module,
    // but we can rely on isolation or test-specific IDs.
  })

  it("should register and retrieve a running task", () => {
    const parent = SessionID.make("parent-1")
    const session = SessionID.make("child-1")

    // Create a dummy fiber that we can track
    const dummyFiber = Effect.runFork(Effect.never)

    StrataTaskRegistry.register(session, {
      status: "running",
      session,
      parent,
      fiber: dummyFiber,
      started: Date.now(),
    })

    const entry = StrataTaskRegistry.get(session)
    expect(entry).toBeDefined()
    expect(entry?.status).toBe("running")
    expect(entry?.session).toBe(session)
    expect(entry?.parent).toBe(parent)
  })

  it("should complete a running task", () => {
    const session = SessionID.make("child-2")
    const dummyFiber = Effect.runFork(Effect.never)

    StrataTaskRegistry.register(session, {
      status: "running",
      session,
      parent: SessionID.make("parent-2"),
      fiber: dummyFiber,
      started: Date.now(),
    })

    StrataTaskRegistry.complete(session, "success output")

    const entry = StrataTaskRegistry.get(session)
    expect(entry?.status).toBe("completed")
    expect(entry?.result).toBe("success output")
  })

  it("should fail a running task", () => {
    const session = SessionID.make("child-3")
    const dummyFiber = Effect.runFork(Effect.never)

    StrataTaskRegistry.register(session, {
      status: "running",
      session,
      parent: SessionID.make("parent-3"),
      fiber: dummyFiber,
      started: Date.now(),
    })

    StrataTaskRegistry.fail(session, "some error")

    const entry = StrataTaskRegistry.get(session)
    expect(entry?.status).toBe("error")
    expect(entry?.error).toBe("some error")
  })

  it("should cancel running tasks from a parent session", async () => {
    const parent = SessionID.make("parent-cancel")
    const session = SessionID.make("child-cancel")

    let interrupted = false
    const program = Effect.never.pipe(
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted = true
        }),
      ),
    )
    const dummyFiber = Effect.runFork(program)

    StrataTaskRegistry.register(session, {
      status: "running",
      session,
      parent,
      fiber: dummyFiber,
      started: Date.now(),
    })

    await Effect.runPromise(StrataTaskRegistry.cancel(parent))

    // The fiber should have been interrupted
    expect(interrupted).toBe(true)
  })
})
