
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

export const Astro: Info = {
  id: "astro",
  extensions: [".astro"],
  root: NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root, ctx) {
    const tsserver = Module.resolve("typescript/lib/tsserver.js", ctx.directory)
    if (!tsserver) {
      log.info("typescript not found, required for Astro language server")
      return
    }
    const tsdk = path.dirname(tsserver)

    let binary = which("astro-ls")
    const args: string[] = []
    if (!binary) {
      if (Flag.STRATA_DISABLE_LSP_DOWNLOAD) return
      const resolved = await Npm.which("@astrojs/language-server")
      if (!resolved) return
      binary = resolved
    }
    args.push("--stdio")
    const proc = spawn(binary, args, {
      cwd: root,
      env: {
        ...process.env,
      },
    })
    return {
      process: proc,
      initialization: {
        typescript: {
          tsdk,
        },
      },
    }
  },
};
