import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import { Log } from "./util"
// stratacode_change start
// import { LoginCommand, LogoutCommand, SwitchCommand, OrgsCommand } from "./cli/cmd/account"
// import { ConsoleCommand } from "./cli/cmd/account"
// stratacode_change end
import { ConsoleCommand } from "./cli/cmd/account"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { Installation } from "./installation"
import { InstallationBuildKind, InstallationVersion } from "./installation/version" // stratacode_change - add InstallationBuildKind
import { NamedError } from "@opencode-ai/shared/util/error"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { Filesystem } from "./util"
import { ConfigCommand as ConfigCLICommand } from "./cli/cmd/config" // stratacode_change
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
// import { GithubCommand } from "./cli/cmd/github" // stratacode_change
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { AttachCommand } from "./cli/cmd/tui/attach"
import { TuiThreadCommand } from "./cli/cmd/tui/thread"
import { AcpCommand } from "./cli/cmd/acp"
import { EOL } from "os"
// import { WebCommand } from "./cli/cmd/web" // stratacode_change (Disabled unsupported opencode web UI)
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { RemoteCommand } from "./cli/cmd/remote" // stratacode_change
import { DevSetupCommand, DevAliasCommand } from "./stratacode/cli/dev-setup" // stratacode_change
// stratacode_change start - Import telemetry, instance disposal, and legacy migration
import { Telemetry } from "@stratacode/strata-telemetry"
import { Instance } from "./project/instance" // stratacode_change
import { migrateLegacyStrataAuth, ENV_FEATURE, ENV_VERSION } from "@stratacode/strata-gateway"

// stratacode_change - set feature for tracking. 'serve' is spawned by other services
// (extension, cloud) which set their own STRATACODE_FEATURE env var. Direct CLI use
// (any command other than 'serve') is tagged as 'cli'. If 'serve' is spawned without
// the env var, it gets 'unknown' so the misconfiguration is visible in data.
if (!process.env[ENV_FEATURE]) {
  const isServe = process.argv.includes("serve")
  process.env[ENV_FEATURE] = isServe ? "unknown" : "cli"
}

// stratacode_change - set version so strata-gateway can include it in the editor name header
if (!process.env[ENV_VERSION]) {
  process.env[ENV_VERSION] = InstallationVersion
}
import { Config } from "./config"
import { Auth } from "./auth"
// stratacode_change end
import { DbCommand } from "./cli/cmd/db"
import path from "path"
import { Global } from "./global"
import { createHelpCommand } from "./stratacode/help-command" // stratacode_change
import { JsonMigration } from "./storage"
import { Database } from "./storage"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { Heap } from "./cli/heap"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { ensureProcessMetadata } from "./util/opencode-process"

const processMetadata = ensureProcessMetadata("main")

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: errorMessage(e),
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: errorMessage(e),
  })
})

const args = hideBin(process.argv)

function show(out: string) {
  const text = out.trimStart()
  const end = out.endsWith(EOL) ? "" : EOL // stratacode_change - keep shell prompt on the next line
  if (!text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + end) // stratacode_change
    return
  }
  process.stderr.write(out + end) // stratacode_change
}

let cli = yargs(args) // stratacode_change
  .parserConfiguration({ "populate--": true })
  .scriptName("strata") // stratacode_change
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.pure) {
      process.env.STRATA_PURE = "1"
    }

    await Log.init({
      print: process.argv.includes("--print-logs"),
      dev: Installation.isLocal(),
      level: (() => {
        if (opts.logLevel) return opts.logLevel as Log.Level
        if (Installation.isLocal()) return "DEBUG"
        return "INFO"
      })(),
    })

    Heap.start()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.STRATA_PID = String(process.pid)

    Log.Default.info("opencode", {
      version: InstallationVersion,
      args: process.argv.slice(2),
      process_role: processMetadata.processRole,
      run_id: processMetadata.runID,
    })

    // stratacode_change start - Initialize telemetry
    const globalCfg = await Config.getGlobal()
    await Telemetry.init({
      dataPath: Global.Path.data,
      version: InstallationVersion,
      enabled: globalCfg.experimental?.openTelemetry !== false,
    })

    // Migrate legacy Strata CLI auth if needed
    await migrateLegacyStrataAuth(
      async () => (await Auth.get("strata")) !== undefined,
      async (auth) => Auth.set("strata", auth),
    )

    const strataAuth = await Auth.get("strata")
    if (strataAuth) {
      const token = strataAuth.type === "oauth" ? strataAuth.access : strataAuth.key
      const accountId = strataAuth.type === "oauth" ? strataAuth.accountId : undefined
      await Telemetry.updateIdentity(token, accountId)
    }

    Telemetry.trackCliStart()
    // stratacode_change end

    const marker = path.join(Global.Path.data, "strata.db")
    if (!(await Filesystem.exists(marker))) {
      const tty = process.stderr.isTTY
      process.stderr.write("Performing one time database migration, may take a few minutes..." + EOL)
      const width = 36
      const orange = "\x1b[38;5;214m"
      const muted = "\x1b[0;2m"
      const reset = "\x1b[0m"
      let last = -1
      if (tty) process.stderr.write("\x1b[?25l")
      try {
        await JsonMigration.run(drizzle({ client: Database.Client().$client }), {
          progress: (event) => {
            const percent = Math.floor((event.current / event.total) * 100)
            if (percent === last && event.current !== event.total) return
            last = percent
            if (tty) {
              const fill = Math.round((percent / 100) * width)
              const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
              process.stderr.write(
                `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`,
              )
              if (event.current === event.total) process.stderr.write("\n")
            } else {
              process.stderr.write(`sqlite-migration:${percent}${EOL}`)
            }
          },
        })
      } finally {
        if (tty) process.stderr.write("\x1b[?25h")
        else {
          process.stderr.write(`sqlite-migration:done${EOL}`)
        }
      }
      process.stderr.write("Database migration complete." + EOL)
    }
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(AcpCommand)
  .command(McpCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  // stratacode_change start
  // .command(LoginCommand)
  // .command(LogoutCommand)
  // .command(SwitchCommand)
  // .command(OrgsCommand)
  // .command(ConsoleCommand)
  // stratacode_change end
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  // .command(WebCommand) // stratacode_change (Disabled unsupported opencode web UI)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  // .command(GithubCommand) // stratacode_change (Disabled until backend is ready)
  .command(PrCommand)
  .command(SessionCommand)
  .command(RemoteCommand) // stratacode_change
  .command(ConfigCLICommand) // stratacode_change
  .command(PluginCommand)
  .command(DbCommand)

// stratacode_change start - dev-only commands are hidden from release builds
if (InstallationBuildKind !== "release") {
  cli = cli.command(DevSetupCommand).command(DevAliasCommand)
}
// stratacode_change end

// stratacode_change start - registered after initial chain to avoid self-referential type error
cli = cli.command(createHelpCommand(() => cli))

cli = cli
  // stratacode_change end
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  let data: Record<string, any> = {}
  if (e instanceof NamedError) {
    const obj = e.toObject()
    Object.assign(data, {
      ...obj.data,
    })
  }

  if (e instanceof Error) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      cause: e.cause?.toString(),
      stack: e.stack,
    })
  }

  if (e instanceof ResolveMessage) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      code: e.code,
      specifier: e.specifier,
      referrer: e.referrer,
      position: e.position,
      importKind: e.importKind,
    })
  }
  Log.Default.error("fatal", data)
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // stratacode_change start - Track CLI exit and shutdown telemetry
  const exitCode = typeof process.exitCode === "number" ? process.exitCode : undefined
  Telemetry.trackCliExit(exitCode)
  await Telemetry.shutdown()
  // stratacode_change end

  await Instance.disposeAll() // stratacode_change - safety net disposal (no-op if already disposed)

  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
