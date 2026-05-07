import type { ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import os from "os"
import { Global } from "../global"
import { Log } from "../util"
import { text } from "node:stream/consumers"
import fs from "fs/promises"
import { Filesystem } from "../util"
import type { InstanceContext } from "../project/instance"
import { Flag } from "../flag/flag"
import { Archive } from "../util"
import { Process } from "../util"
import { which } from "../util/which"
import { Module } from "@opencode-ai/shared/util/module"
import { spawn } from "./launch"
import { Npm } from "../npm"
import { TsCheck } from "../stratacode/ts-check" // stratacode_change

export const log = Log.create({ service: "lsp.server" })
export const pathExists = async (p: string) =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)
export const run = (cmd: string[], opts: Process.RunOptions = {}) => Process.run(cmd, { ...opts, nothrow: true })
export const output = (cmd: string[], opts: Process.RunOptions = {}) => Process.text(cmd, { ...opts, nothrow: true })

export interface Handle {
  process: ChildProcessWithoutNullStreams
  initialization?: Record<string, any>
}

type RootFunction = (file: string, ctx: InstanceContext) => Promise<string | undefined>

export const NearestRoot = (includePatterns: string[], excludePatterns?: string[]): RootFunction => {
  return async (file, ctx) => {
    if (excludePatterns) {
      const excludedFiles = Filesystem.up({
        targets: excludePatterns,
        start: path.dirname(file),
        stop: ctx.directory,
      })
      const excluded = await excludedFiles.next()
      await excludedFiles.return()
      if (excluded.value) return undefined
    }
    const files = Filesystem.up({
      targets: includePatterns,
      start: path.dirname(file),
      stop: ctx.directory,
    })
    const first = await files.next()
    await files.return()
    if (!first.value) return ctx.directory
    return path.dirname(first.value)
  }
}

export interface Info {
  id: string
  extensions: string[]
  global?: boolean
  root: RootFunction
  spawn(root: string, ctx: InstanceContext): Promise<Handle | undefined>
}

// stratacode_change start - tsgo native LSP or lightweight diagnostic client
// When STRATA_EXPERIMENTAL_LSP_TOOL is enabled, spawn tsgo --lsp --stdio as a
// persistent LSP server (full diagnostics, hover, go-to-definition, etc.).
// Otherwise spawn() returns undefined and getClients() in index.ts falls
// through to the lightweight TsClient that shells out to tsgo --noEmit on demand.
// stratacode_change end
export { Deno } from "./servers/Deno";
export { Typescript } from "./servers/Typescript";
export { Vue } from "./servers/Vue";
export { ESLint } from "./servers/ESLint";
export { Oxlint } from "./servers/Oxlint";
export { Biome } from "./servers/Biome";
export { Gopls } from "./servers/Gopls";
export { Rubocop } from "./servers/Rubocop";
export { Ty } from "./servers/Ty";
export { Pyright } from "./servers/Pyright";
export { ElixirLS } from "./servers/ElixirLS";
export { Zls } from "./servers/Zls";
export { CSharp } from "./servers/CSharp";
export { FSharp } from "./servers/FSharp";
export { SourceKit } from "./servers/SourceKit";
export { RustAnalyzer } from "./servers/RustAnalyzer";
export { Clangd } from "./servers/Clangd";
export { Svelte } from "./servers/Svelte";
export { Astro } from "./servers/Astro";
export { JDTLS } from "./servers/JDTLS";
export { KotlinLS } from "./servers/KotlinLS";
export { YamlLS } from "./servers/YamlLS";
export { LuaLS } from "./servers/LuaLS";
export { PHPIntelephense } from "./servers/PHPIntelephense";
export { Prisma } from "./servers/Prisma";
export { Dart } from "./servers/Dart";
export { Ocaml } from "./servers/Ocaml";
export { BashLS } from "./servers/BashLS";
export { TerraformLS } from "./servers/TerraformLS";
export { TexLab } from "./servers/TexLab";
export { DockerfileLS } from "./servers/DockerfileLS";
export { Gleam } from "./servers/Gleam";
export { Clojure } from "./servers/Clojure";
export { Nixd } from "./servers/Nixd";
export { Tinymist } from "./servers/Tinymist";
export { HLS } from "./servers/HLS";
export { JuliaLS } from "./servers/JuliaLS";
