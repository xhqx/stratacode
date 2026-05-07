
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

export const Clojure: Info = {
  id: "clojure-lsp",
  extensions: [".clj", ".cljs", ".cljc", ".edn"],
  root: NearestRoot(["deps.edn", "project.clj", "shadow-cljs.edn", "bb.edn", "build.boot"]),
  async spawn(root) {
    let bin = which("clojure-lsp")
    if (!bin && process.platform === "win32") {
      bin = which("clojure-lsp.exe")
    }
    if (!bin) {
      log.info("clojure-lsp not found, please install clojure-lsp first")
      return
    }
    return {
      process: spawn(bin, ["listen"], {
        cwd: root,
      }),
    }
  },
};
