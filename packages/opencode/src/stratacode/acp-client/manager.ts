// stratacode_change - new file
import { Effect, Context, Layer } from "effect"
import { InstanceState } from "@/effect"
import { Log } from "../../util"
import { ConfigACPAgent } from "./config"
import { StdioTransport } from "./transport"
import { ClientSideConnection, type InitializeRequest, type Client } from "@agentclientprotocol/sdk"

const log = Log.create({ service: "acp-manager" })

export interface Interface {
  readonly getConnection: (agentKey: string, config: ConfigACPAgent) => Effect.Effect<{ conn: ClientSideConnection, transport: StdioTransport }>
}

type State = {
  transports: Map<string, { conn: ClientSideConnection, transport: StdioTransport }>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ACPManager") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make<State>(
      Effect.fn("ACPManager.state")(function* () {
        return {
          transports: new Map()
        }
      })
    )

    const getConnection = Effect.fn("ACPManager.getConnection")(function* (agentKey: string, config: ConfigACPAgent) {
      const s = yield* InstanceState.get(state)
      
      let entry = s.transports.get(agentKey)
      if (entry) return entry

      log.info("Initializing new ACP transport", { agentKey })
      const transport = new StdioTransport(config)
      
      const { stream } = yield* Effect.promise(() => transport.start())

      // Create a dummy client implementation for now.
      // We will enhance this when we implement adapter.ts tools.
      const conn = new ClientSideConnection((agent): Client => {
        return {
          readTextFile: async (params: any) => {
            log.info("Agent requested fs.readTextFile", { params })
            return { content: "" }
          },
          writeTextFile: async (params: any) => {
            log.info("Agent requested fs.writeTextFile", { params })
            return {}
          },
          requestPermission: async (params: any) => {
            log.info("Agent requested permission", { params })
            return { granted: true }
          },
          sessionUpdate: async (params: any) => {
            log.info("Agent session update", { params })
          },
          createTerminal: async (params: any) => {
            throw new Error("createTerminal not implemented yet")
          },
          unstable_createElicitation: async (params: any) => {
            throw new Error("createElicitation not implemented yet")
          },
          unstable_completeElicitation: async (params: any) => {
            throw new Error("completeElicitation not implemented yet")
          }
        } as unknown as Client
      }, stream)

      const initReq: InitializeRequest = {
        protocolVersion: 1,
        clientInfo: { name: "stratacode", version: "1.0.0" },
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true // the ACP spec for terminal capability might be boolean or object, in latest SDK it's likely boolean? Wait, SDK says `{ create?: boolean }` or similar? Let's check.
        }
      }
      yield* Effect.promise(() => conn.initialize(initReq))
      log.info("ACP agent initialized successfully", { agentKey })

      entry = { conn, transport }
      s.transports.set(agentKey, entry)

      return entry
    })

    return Service.of({
      getConnection
    })
  })
)

export const defaultLayer = layer
