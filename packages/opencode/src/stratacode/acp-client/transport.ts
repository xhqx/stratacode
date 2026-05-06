// stratacode_change - new file
import { spawn, type ChildProcess } from "child_process"
import { ClientSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { Log } from "../../util"
import type { ConfigACPProvider } from "./config"

const log = Log.create({ service: "acp-transport" })

export class StdioTransport {
  private child: ChildProcess | undefined
  public connection: ClientSideConnection | undefined

  constructor(private config: ConfigACPProvider) {}

  async start(): Promise<{ child: ChildProcess; stream: import("@agentclientprotocol/sdk").Stream }> {
    if (this.child) throw new Error("Provider already running")

    if (!this.config.command || this.config.command.length === 0) {
      throw new Error("ACP provider command is required")
    }

    const [cmd, ...args] = this.config.command
    log.info("Spawning ACP provider", { cmd, args })

    this.child = spawn(cmd, args, {
      env: { ...process.env, ...(this.config.env ?? {}) },
      cwd: this.config.cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.child.stderr?.on("data", (data) => {
      log.debug("ACP provider stderr", { output: data.toString() })
    })

    this.child.on("error", (err) => {
      log.error("ACP provider process error", { error: err.message })
    })

    this.child.on("exit", (code) => {
      log.info("ACP provider exited", { code })
      this.child = undefined
    })

    const { Writable, Readable } = await import("stream")
    const stream = ndJsonStream(
      Writable.toWeb(this.child.stdin!) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(this.child.stdout!) as unknown as ReadableStream<Uint8Array>,
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
