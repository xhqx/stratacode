// stratacode_change - new file
import { Effect, Context, Layer, Stream } from "effect"
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
      return Stream.unwrap(Effect.gen(function* () {
        const config = input.agent.options.acp_config as ConfigACPAgent
        const { conn } = yield* acpManager.getConnection(input.agent.name, config)

        const promptReq: Parameters<ClientSideConnection["prompt"]>[0] = {
          sessionId: input.sessionID,
          prompt: input.messages.map(m => ({
            type: "text" as const,
            text: Array.isArray(m.content) 
              ? m.content.map(c => {
                  if (c.type === "text") return c.text
                  // @ts-ignore
                  if (c.type === "tool-result") return `Tool ${c.toolName} result: ${JSON.stringify(c.result)}`
                  return ""
                }).join("\n")
              : String(m.content)
          }))
        }

        log.info("Sending prompt to ACP agent", { sessionID: input.sessionID })
        
        yield* Effect.sync(() => {
          // Note: In real stream, these are emitted via queue
        })

        try {
          const response = yield* Effect.promise(() => conn.prompt(promptReq))
        } catch (e) {
          log.error("Error from ACP agent", { error: e })
          throw e
        }
        
        return Stream.fromIterable([
          { type: "start" } as Extract<LLM.Event, { type: "start" }>,
          {
            type: "text-start",
            id: PartID.ascending()
          } as Extract<LLM.Event, { type: "text-start" }>,
          {
            type: "text-delta",
            id: PartID.ascending(),
            text: "Response from ACP agent (simulated for now pending session/update implementation)"
          } as Extract<LLM.Event, { type: "text-delta" }>,
          {
            type: "text-end",
            id: PartID.ascending()
          } as Extract<LLM.Event, { type: "text-end" }>,
          {
            type: "finish-step",
            finishReason: "stop",
            usage: { promptTokens: 0, completionTokens: 0 }
          } as unknown as Extract<LLM.Event, { type: "finish-step" }>
        ])
      }))
    }

    return Service.of({ stream })
  })
)

export const defaultLayer = layer
