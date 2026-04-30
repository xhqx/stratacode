import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "../config"
import { Effect } from "effect"
import { StrataTask } from "../stratacode/tool/task" // stratacode_change
import { StrataCostPropagation } from "../stratacode/session/cost-propagation" // stratacode_change
import { StrataTaskRegistry } from "../stratacode/tool/task-registry" // stratacode_change
import { Scope } from "effect" // stratacode_change
import * as ModelPool from "../stratacode/model-pool" // stratacode_change

export interface TaskPromptOps {
  cancel(sessionID: SessionID): void
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<MessageV2.WithParts>
  scope: Scope.Scope // stratacode_change
}

const id = "task"

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
  background: z
    .boolean()
    .describe("If true, start in background and return task_id immediately. Use task_status to retrieve results.")
    .optional(), // stratacode_change
})

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service

    const run = Effect.fn("TaskTool.execute")(function* (params: z.infer<typeof parameters>, ctx: Tool.Context) {
      const cfg = yield* config.get()

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }
      // stratacode_change start — reject primary agents; only subagent/all modes allowed
      StrataTask.validate(next, params.subagent_type)
      // stratacode_change end

      const canTask = next.permission.some((rule) => rule.permission === id)
      const canTodo = next.permission.some((rule) => rule.permission === "todowrite")

      // stratacode_change start — inherit edit/bash/MCP restrictions from calling agent
      const caller = yield* agent.get(ctx.agent)
      const parent = yield* Effect.promise(() => Session.get(SessionID.make(ctx.sessionID)))
      const rules = StrataTask.inherited({ caller, session: parent, mcp: cfg.mcp })
      // stratacode_change end

      const taskID = params.task_id
      const session = taskID
        ? yield* sessions.get(SessionID.make(taskID)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      const nextSession =
        session ??
        (yield* sessions.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${next.name} subagent)`,
          permission: [
            ...(canTodo
              ? []
              : [
                  {
                    permission: "todowrite" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(canTask
              ? []
              : [
                  {
                    permission: id,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(cfg.experimental?.primary_tools?.map((item) => ({
              pattern: "*",
              action: "allow" as const,
              permission: item,
            })) ?? []),
            // stratacode_change start — deny task + propagate caller restrictions
            ...StrataTask.permissions(rules),
            // stratacode_change end
          ],
        }))

      const msg = yield* Effect.sync(() => MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }))
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))

      // stratacode_change start — prefer user's CLI-saved pick for this subagent
      const saved = yield* StrataTask.resolveModel(next.name)
      const poolModel = yield* ModelPool.acquire(next.model_pool)
      const model = poolModel
        ? { modelID: poolModel.modelID, providerID: poolModel.providerID }
        : (saved ??
          next.model ?? {
            modelID: msg.info.modelID,
            providerID: msg.info.providerID,
          })
      const variant = poolModel ? undefined : (saved?.variant ?? (saved ? undefined : next.variant))
      // stratacode_change end

      yield* ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: nextSession.id,
          model,
          variant, // stratacode_change
        },
      })

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const messageID = MessageID.ascending()

      function cancel() {
        ops.cancel(nextSession.id)
      }

      // stratacode_change start — background fire-and-fork mode
      if (params.background) {
        const fiber = yield* Effect.gen(function* () {
          const costBefore = yield* StrataCostPropagation.childCost(sessions, nextSession.id)
          return yield* Effect.acquireUseRelease(
            Effect.succeed(costBefore),
            () =>
              Effect.gen(function* () {
                const parts = yield* ops.resolvePromptParts(params.prompt)
                return yield* ops.prompt({
                  messageID,
                  sessionID: nextSession.id,
                  model: {
                    modelID: model.modelID,
                    providerID: model.providerID,
                  },
                  variant,
                  agent: next.name,
                  tools: {
                    ...(canTodo ? {} : { todowrite: false }),
                    ...(canTask ? {} : { task: false }),
                    ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
                  },
                  parts,
                })
              }),
            (costBefore) =>
              Effect.gen(function* () {
                ctx.abort.removeEventListener("abort", cancel)
                if (poolModel) yield* ModelPool.release(poolModel.providerID, poolModel.modelID)
                const costAfter = yield* StrataCostPropagation.childCost(sessions, nextSession.id)
                yield* StrataCostPropagation.propagate(sessions, ctx.sessionID, ctx.messageID, costAfter - costBefore)
              }),
          )
        }).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              const output = result.parts.findLast((p) => p.type === "text")?.text ?? ""
              StrataTaskRegistry.complete(nextSession.id, output)
            }),
          ),
          Effect.catch((error: unknown) =>
            Effect.sync(() => {
              StrataTaskRegistry.fail(nextSession.id, error instanceof Error ? error.message : String(error))
            }),
          ),
          Effect.forkIn(ops.scope),
        )

        StrataTaskRegistry.register(nextSession.id, {
          status: "running",
          session: nextSession.id,
          parent: SessionID.make(ctx.sessionID),
          fiber,
          started: Date.now(),
        })

        return {
          title: params.description,
          metadata: { sessionId: nextSession.id, model, variant },
          output: [
            `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
            `Task "${params.description}" started in background.`,
            `Use the task_status tool with this task_id to check progress or retrieve results.`,
          ].join("\n"),
        }
      }
      // stratacode_change end

      return yield* Effect.acquireUseRelease(
        // stratacode_change start - snapshot child cost so we propagate only the delta on resume (#6321)
        Effect.gen(function* () {
          ctx.abort.addEventListener("abort", cancel)
          return yield* StrataCostPropagation.childCost(sessions, nextSession.id)
        }),
        // stratacode_change end
        () =>
          Effect.gen(function* () {
            const parts = yield* ops.resolvePromptParts(params.prompt)
            const result = yield* ops.prompt({
              messageID,
              sessionID: nextSession.id,
              model: {
                modelID: model.modelID,
                providerID: model.providerID,
              },
              variant, // stratacode_change
              agent: next.name,
              tools: {
                ...(canTodo ? {} : { todowrite: false }),
                ...(canTask ? {} : { task: false }),
                ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
              },
              parts,
            })

            return {
              title: params.description,
              metadata: {
                sessionId: nextSession.id,
                model,
                variant, // stratacode_change
              },
              output: [
                `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
                "",
                "<task_result>",
                result.parts.findLast((item) => item.type === "text")?.text ?? "",
                "</task_result>",
              ].join("\n"),
            }
          }),
        // stratacode_change start - propagate subagent cost delta to parent on every exit path (#6321)
        (costBefore) =>
          Effect.gen(function* () {
            ctx.abort.removeEventListener("abort", cancel)
            if (poolModel) yield* ModelPool.release(poolModel.providerID, poolModel.modelID)
            const costAfter = yield* StrataCostPropagation.childCost(sessions, nextSession.id)
            yield* StrataCostPropagation.propagate(sessions, ctx.sessionID, ctx.messageID, costAfter - costBefore)
          }),
        // stratacode_change end
      )
    })

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
