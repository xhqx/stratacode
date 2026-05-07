
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

export const Ocaml: Info = {
  id: "ocaml-lsp",
  extensions: [".ml", ".mli"],
  root: NearestRoot(["dune-project", "dune-workspace", ".merlin", "opam"]),
  async spawn(root) {
    const bin = which("ocamllsp")
    if (!bin) {
      log.info("ocamllsp not found, please install ocaml-lsp-server")
      return
    }
    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
};
