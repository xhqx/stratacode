
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

export const RustAnalyzer: Info = {
  id: "rust",
  root: async (file, ctx) => {
    const crateRoot = await NearestRoot(["Cargo.toml", "Cargo.lock"])(file, ctx)
    if (crateRoot === undefined) {
      return undefined
    }
    let currentDir = crateRoot

    while (currentDir !== path.dirname(currentDir)) {
      // Stop at filesystem root
      const cargoTomlPath = path.join(currentDir, "Cargo.toml")
      try {
        const cargoTomlContent = await Filesystem.readText(cargoTomlPath)
        if (cargoTomlContent.includes("[workspace]")) {
          return currentDir
        }
      } catch {
        // File doesn't exist or can't be read, continue searching up
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break // Reached filesystem root
      currentDir = parentDir

      // Stop if we've gone above the app root
      if (!currentDir.startsWith(ctx.worktree)) break
    }

    return crateRoot
  },
  extensions: [".rs"],
  async spawn(root) {
    const bin = which("rust-analyzer")
    if (!bin) {
      log.info("rust-analyzer not found in path, please install it")
      return
    }
    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
};
