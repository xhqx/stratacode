// stratacode_change - new file
import { Effect, Context, Layer } from "effect"
import { InstanceState } from "@/effect"
import { Log } from "../../util"
import { ConfigACPProvider } from "./config"
import { StdioTransport } from "./transport"
import { ClientSideConnection, type Client, type InitializeRequest, type ModelInfo, type SessionUpdate } from "@agentclientprotocol/sdk"
import { EventEmitter } from "events"

const log = Log.create({ service: "acp-manager" })

export interface Interface {
  readonly getConnection: (
    agentKey: string,
    config: ConfigACPProvider,
  ) => Effect.Effect<{ conn: ClientSideConnection; transport: StdioTransport; models: ModelInfo[]; sessionId: string; events: EventEmitter }>
}

type State = {
  transports: Map<string, { fingerprint: string; conn: ClientSideConnection; transport: StdioTransport; models: ModelInfo[]; sessionId: string; events: EventEmitter }>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ACPManager") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make<State>(
      Effect.fn("ACPManager.state")(function* () {
        return {
          transports: new Map(),
        }
      }),
    )

    const getConnection = Effect.fn("ACPManager.getConnection")(function* (
      agentKey: string,
      config: ConfigACPProvider,
    ) {
      const s = yield* InstanceState.get(state)

      const cmdStr = config.command?.join(" ") ?? ""
      const envStr = Object.entries(config.env ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(";")
      const fingerprint = `${cmdStr}|${envStr}|${process.cwd()}`

      let entry = s.transports.get(agentKey)
      if (entry) {
        if (entry.fingerprint === fingerprint) {
          return entry
        }
        log.info("ACP provider config changed, restarting", { agentKey })
        // Clean up the old transport if possible
        // (In the future, add transport.stop() if supported)
        s.transports.delete(agentKey)
      }

      log.info("Initializing new ACP transport", { agentKey })
      const transport = new StdioTransport(config)

      const { stream } = yield* Effect.promise(() => transport.start())

      // Create a dummy client implementation for now.
      // We will enhance this when we implement adapter.ts tools.
      const events = new EventEmitter()

      const conn = new ClientSideConnection((agent): Client => {
        return {
          readTextFile: async (params: any) => {
            log.info("Provider requested fs.readTextFile", { params })
            return { content: "" }
          },
          writeTextFile: async (params: any) => {
            log.info("Provider requested fs.writeTextFile", { params })
            return {}
          },
          requestPermission: async (params: any) => {
            log.info("Provider requested permission", { params })
            return { granted: true }
          },
          sessionUpdate: async (params: SessionUpdate) => {
            log.debug("Provider session update", { params })
            events.emit("sessionUpdate", params)
          },
          createTerminal: async (params: any) => {
            throw new Error("createTerminal not implemented yet")
          },
          unstable_createElicitation: async (params: any) => {
            throw new Error("createElicitation not implemented yet")
          },
          unstable_completeElicitation: async (params: any) => {
            throw new Error("completeElicitation not implemented yet")
          },
        } as unknown as Client
      }, stream)

      const initReq: InitializeRequest = {
        protocolVersion: 1,
        clientInfo: { name: "stratacode", version: "1.0.0" },
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      }
      yield* Effect.promise(() => conn.initialize(initReq))
      
      const session = yield* Effect.promise(() => conn.newSession({ cwd: process.cwd(), mcpServers: [] }))
      const sessionId = session.sessionId
      
      const discovered = session.models?.availableModels ?? []
      if (discovered.length > 0) {
        log.info("ACP provider reported models", {
          agentKey,
          count: discovered.length,
          models: discovered.map((m) => m.modelId),
        })
      }
      log.info("ACP provider initialized successfully", { agentKey })

      entry = { fingerprint, conn, transport, models: discovered, sessionId: session.sessionId, events }
      s.transports.set(agentKey, entry)

      return entry
    })

    return Service.of({
      getConnection,
    })
  }),
)

export const defaultLayer = layer
