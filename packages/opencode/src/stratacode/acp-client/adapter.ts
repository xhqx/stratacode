// stratacode_change - new file
import { Effect, Context, Layer, Stream, Queue } from "effect"
import { LLM } from "../../session/llm"
import { Log } from "../../util"
import { Service as ACPManagerService } from "./manager"
import { ConfigACPAgent } from "./config"
import { Permission } from "@/permission"
import { PartID } from "@/session/schema"
import { type ClientSideConnection } from "@agentclientprotocol/sdk"

const log = Log.create({ service: "acp-adapter" })

export interface Interface {
  readonly stream: (input: LLM.StreamInput) => Stream.Stream<LLM.Event, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ACPAdapter") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const acpManager = yield* ACPManagerService

    const stream = (input: LLM.StreamInput): Stream.Stream<LLM.Event, unknown> => {
      return Stream.unwrap(
        Effect.gen(function* () {
          const config = input.model.options?.acpConfig as ConfigACPAgent
          const key = (input.model.options?.acpKey as string) ?? input.model.providerID
          const { conn, sessionId, events } = yield* acpManager.getConnection(key, config)
          const model = input.model.api.id

          if (model && model !== "default") {
            yield* Effect.promise(() =>
              conn.unstable_setSessionModel({
                sessionId,
                modelId: model,
              }),
            )
          }

          const promptReq: Parameters<ClientSideConnection["prompt"]>[0] = {
            sessionId,
            prompt: input.messages.map((m) => ({
              type: "text" as const,
              text: Array.isArray(m.content)
                ? m.content
                    .map((c) => {
                      if (c.type === "text") return c.text
                      // @ts-ignore
                      if (c.type === "tool-result") return `Tool ${c.toolName} result: ${JSON.stringify(c.result)}`
                      return ""
                    })
                    .join("\n")
                : String(m.content),
            })),
          }

          log.info("Sending prompt to ACP agent", { sessionID: input.sessionID })

          // Create a queue for incoming stream events
          const queue = yield* Effect.acquireRelease(
            Queue.unbounded<LLM.Event>(),
            (q) => Queue.shutdown(q)
          )

          // We don't have access to the actual part IDs natively yet without parsing the events
          // But LLM.Event needs IDs. Let's just track a current text ID.
          let currentTextId = ""
          let currentReasoningId = ""

          const onSessionUpdate = (params: any) => {
            if (params.sessionId !== sessionId) return
            
            const update = params.update
            if (!update) return

            // Map ACP session updates to Strata LLM events
            if (update.sessionUpdate === "agent_message_chunk") {
              if (currentReasoningId) {
                // @ts-ignore
                Effect.runFork(Queue.offer(queue, { type: "reasoning-end", id: currentReasoningId }))
                currentReasoningId = ""
              }
              const content = update.content
              if (content?.type === "text" && content.text) {
                if (!currentTextId) {
                  currentTextId = PartID.ascending()
                  Effect.runFork(Queue.offer(queue, { type: "text-start", id: currentTextId }))
                }
                Effect.runFork(Queue.offer(queue, { type: "text-delta", id: currentTextId, text: content.text }))
              }
            } else if (update.sessionUpdate === "agent_thought_chunk") {
              if (currentTextId) {
                Effect.runFork(Queue.offer(queue, { type: "text-end", id: currentTextId }))
                currentTextId = ""
              }
              const content = update.content
              if (content?.type === "text" && content.text) {
                if (!currentReasoningId) {
                  currentReasoningId = PartID.ascending()
                  // @ts-ignore
                  Effect.runFork(Queue.offer(queue, { type: "reasoning-start", id: currentReasoningId }))
                }
                // @ts-ignore
                Effect.runFork(Queue.offer(queue, { type: "reasoning-delta", id: currentReasoningId, text: content.text }))
              }
            }
          }

          events.on("sessionUpdate", onSessionUpdate)

          Effect.runFork(Queue.offer(queue, { type: "start" } as Extract<LLM.Event, { type: "start" }>))
          Effect.runFork(Queue.offer(queue, { type: "start-step" } as Extract<LLM.Event, { type: "start-step" }>))

          // We fire the prompt asynchronously so the stream can start yielding
          Effect.runFork(
            Effect.promise(async () => {
              try {
                await conn.prompt(promptReq)
                
                if (currentTextId) {
                  await Effect.runPromise(Queue.offer(queue, { type: "text-end", id: currentTextId }))
                  currentTextId = ""
                }
                if (currentReasoningId) {
                  // @ts-ignore
                  await Effect.runPromise(Queue.offer(queue, { type: "reasoning-end", id: currentReasoningId }))
                  currentReasoningId = ""
                }
                
                await Effect.runPromise(Queue.offer(queue, { 
                  type: "finish-step", 
                  finishReason: "stop", 
                  usage: { promptTokens: 0, completionTokens: 0 } 
                } as unknown as Extract<LLM.Event, { type: "finish-step" }>))
              } catch (e) {
                log.error("Error from ACP agent prompt", { error: e })
                await Effect.runPromise(Queue.offer(queue, { type: "error", error: e }))
              } finally {
                await Effect.runPromise(Queue.shutdown(queue))
              }
            })
          )

          return Stream.fromQueue(queue).pipe(
            Stream.ensuring(Effect.sync(() => {
              events.off("sessionUpdate", onSessionUpdate)
            }))
          )
        }),
      )
    }

    return Service.of({ stream })
  }),
)

export const defaultLayer = layer
