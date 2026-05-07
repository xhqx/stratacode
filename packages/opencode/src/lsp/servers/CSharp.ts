
import type { ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import os from "os"
import { Global } from "../../global"
import { Log } from "../../util"
import { text } from "node:stream/consumers"
import fs from "fs/promises"
import { Filesystem } from "../../util"
import type { InstanceContext } from "../../project/instance"
import { Flag } from "../../flag/flag"
import { Archive } from "../../util"
import { Process } from "../../util"
import { which } from "../../util/which"
import { Module } from "@opencode-ai/shared/util/module"
import { spawn } from "../launch"
import { Npm } from "../../npm"
import { TsCheck } from "../../stratacode/ts-check"
import type { Info, Handle } from "../server";
import { log, pathExists, run, NearestRoot } from "../server";

export const CSharp: Info = {
  id: "csharp",
  root: NearestRoot([".slnx", ".sln", ".csproj", "global.json"]),
  extensions: [".cs"],
  async spawn(root) {
    let bin = which("roslyn-language-server")
    if (!bin) {
      if (!which("dotnet")) {
        log.error(".NET SDK is required to install roslyn-language-server")
        return
      }

      if (Flag.STRATA_DISABLE_LSP_DOWNLOAD) return
      log.info("installing roslyn-language-server via dotnet tool")
      const proc = Process.spawn(["dotnet", "tool", "install", "--global", "roslyn-language-server", "--prerelease"], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })
      const exit = await proc.exited
      if (exit !== 0) {
        log.error("Failed to install roslyn-language-server")
        return
      }

      bin = path.join(Global.Path.bin, "roslyn-language-server" + (process.platform === "win32" ? ".exe" : ""))
      log.info(`installed roslyn-language-server`, { bin })
    }

    return {
      process: spawn(bin, ["--stdio", "--autoLoadProjects"], {
        cwd: root,
      }),
    }
  },
};
