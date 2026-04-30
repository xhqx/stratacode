// stratacode_change - new file
import { spawn, type ChildProcess } from "child_process"
import { ClientSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { Log } from "../../util"
import type { ConfigACPAgent } from "./config"

const log = Log.create({ service: "acp-transport" })

export class StdioTransport {
  private child: ChildProcess | undefined
  public connection: ClientSideConnection | undefined

  constructor(private config: ConfigACPAgent) {}

  async start(): Promise<{ child: ChildProcess, stream: import("@agentclientprotocol/sdk").Stream }> {
    if (this.child) throw new Error("Agent already running")

    if (!this.config.command || this.config.command.length === 0) {
      throw new Error("ACP agent command is required")
    }

    const [cmd, ...args] = this.config.command
    log.info("Spawning ACP agent", { cmd, args })

    this.child = spawn(cmd, args, {
      env: { ...process.env, ...(this.config.env ?? {}) },
      cwd: this.config.cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    })

    this.child.stderr?.on("data", (data) => {
      log.debug("ACP agent stderr", { output: data.toString() })
    })

    this.child.on("error", (err) => {
      log.error("ACP agent process error", { error: err.message })
    })

    this.child.on("exit", (code) => {
      log.info("ACP agent exited", { code })
      this.child = undefined
    })

    const { Writable, Readable } = await import("stream")
    const stream = ndJsonStream(
      Writable.toWeb(this.child.stdin!) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(this.child.stdout!) as unknown as ReadableStream<Uint8Array>
    )

    return { child: this.child, stream }
  }

  async stop() {
    if (this.child) {
      this.child.kill()
      this.child = undefined
    }
  }
}
