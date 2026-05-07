
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

export const JuliaLS: Info = {
  id: "julials",
  extensions: [".jl"],
  root: NearestRoot(["Project.toml", "Manifest.toml", "*.jl"]),
  async spawn(root) {
    const julia = which("julia")
    if (!julia) {
      log.info("julia not found, please install julia first (https://julialang.org/downloads/)")
      return
    }
    return {
      process: spawn(julia, ["--startup-file=no", "--history-file=no", "-e", "using LanguageServer; runserver()"], {
        cwd: root,
      }),
    }
  },
};
