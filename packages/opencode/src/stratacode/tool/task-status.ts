import * as Tool from "@/tool/tool"
import { Effect, Fiber, Exit, Cause } from "effect"
import z from "zod"
import { StrataTaskRegistry } from "./task-registry"

const parameters = z.object({
  task_id: z.string().describe("The task_id returned by a previous background task call"),
  wait: z
    .boolean()
    .optional()
    .describe(
      "If true, block until the task completes (up to timeout_seconds). " +
        "If it times out, returns 'Task is still running' — the task keeps running.",
    ),
  timeout_seconds: z
    .number()
    .optional()
    .describe("The maximum number of seconds to wait if wait is true. Defaults to 120."),
})

export const TaskStatusTool = Tool.define(
  "task_status",
  Effect.gen(function* () {
    const run = Effect.fn("TaskStatusTool.execute")(function* (
      params: z.infer<typeof parameters>,
      ctx: Tool.Context,
    ) {
      const entry = StrataTaskRegistry.get(params.task_id)
      
      if (!entry) {
        return yield* Effect.fail(new Error(`Unknown task_id: ${params.task_id}. The task may have expired or was spawned by a different session.`))
      }

      if (entry.status === "completed") {
        return {
          title: "Task Completed",
          output: entry.result ?? "Task completed with no output.",
          metadata: {},
        }
      }

      if (entry.status === "error") {
        return yield* Effect.fail(new Error(`Task failed: ${entry.error ?? "Unknown error"}`))
      }

      // entry.status === "running"
      if (!params.wait) {
        return {
          title: "Task Running",
          output: "Task is still running in the background.",
          metadata: {},
        }
      }

      // Wait mode
      const timeoutSecs = params.timeout_seconds ?? 120
      
      return yield* Effect.gen(function* () {
        const exit = yield* Fiber.await(entry.fiber).pipe(
          Effect.timeout(`${timeoutSecs} seconds`),
          Effect.exit,
        )

        if (Exit.isSuccess(exit)) {
          const innerExit = exit.value
          if (Exit.isSuccess(innerExit)) {
            const updatedEntry = StrataTaskRegistry.get(params.task_id)
            if (updatedEntry && updatedEntry.status === "completed") {
              return {
                title: "Task Completed",
                output: updatedEntry.result ?? "Task completed with no output.",
                metadata: {},
              }
            }
            if (updatedEntry && updatedEntry.status === "error") {
              return yield* Effect.fail(new Error(`Task failed: ${updatedEntry.error ?? "Unknown error"}`))
            }
            return {
              title: "Task Completed",
              output: "Task completed successfully.",
              metadata: {},
            }
          } else {
            const errMessage = Cause.pretty(innerExit.cause)
            return yield* Effect.fail(new Error(`Task failed during wait: ${errMessage}`))
          }
        } else {
          // If the await itself failed, it's likely a timeout
          return {
            title: "Task Running",
            output: `Task is still running after ${timeoutSecs} seconds. You can check the status again later.`,
            metadata: {},
          }
        }
      })
    })

    return {
      description: "Check the status of a background task, or wait for it to complete.",
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
