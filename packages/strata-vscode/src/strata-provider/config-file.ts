import { existsSync } from "fs"
import * as os from "os"
import * as path from "path"

export type Scope = "global" | "local"

export type Source =
  | "sourceXdg"
  | "sourceHomeStrata"
  | "sourceHomeStratacode"
  | "sourceHomeOpencode"
  | "sourceEnvFile"
  | "sourceEnvDir"
  | "sourceEnvContent"
  | "sourceProjectStrata"
  | "sourceProjectRoot"
  | "sourceProjectStratacode"
  | "sourceProjectOpencode"

export interface Entry {
  file?: string
  name: string
  source: Source
  exists: boolean
  loaded: boolean
  legacy?: boolean
  recommended?: boolean
  virtual?: boolean
}

const SCHEMA = "https://app.strata.ai/config.json"

const MODERN = ["strata.jsonc", "strata.json"]
const LEGACY = ["opencode.jsonc", "opencode.json"]
const FILES = [...MODERN, ...LEGACY]
const GLOBAL = ["strata.jsonc", "strata.json", "opencode.jsonc", "opencode.json", "config.json"]
const HOME = [".strata", ".stratacode", ".opencode"]
const SOURCES: Record<string, Source> = {
  ".strata": "sourceHomeStrata",
  ".stratacode": "sourceHomeStratacode",
  ".opencode": "sourceHomeOpencode",
}

function row(file: string, source: Source, loaded = true, recommended = false): Entry {
  const name = path.basename(file)
  return {
    file,
    name,
    source,
    exists: existsSync(file),
    loaded: loaded && existsSync(file),
    legacy: name.startsWith("opencode") || name === "config.json" || file.includes(`${path.sep}.stratacode${path.sep}`),
    recommended,
  }
}

function ensure(list: Entry[], file: string, source: Source) {
  if (list.some((item) => item.file === file)) return list
  return [...list, row(file, source, true, true)]
}

export function globalFiles() {
  const root = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "strata")
  const base = GLOBAL.map((file) => row(path.join(root, file), "sourceXdg")).filter((item) => item.exists)
  const dirs = HOME.flatMap((dir) => {
    const base = path.join(os.homedir(), dir)
    if (!existsSync(base)) return []
    return FILES.map((file) => row(path.join(base, file), SOURCES[dir])).filter((item) => item.exists)
  })
  const env = process.env.STRATA_CONFIG ? [row(process.env.STRATA_CONFIG, "sourceEnvFile")] : []
  const extra = process.env.STRATA_CONFIG_DIR
  const dir = extra
    ? ensure(
        FILES.map((file) => row(path.join(extra, file), "sourceEnvDir")).filter((item) => item.exists),
        path.join(extra, "strata.jsonc"),
        "sourceEnvDir",
      )
    : []
  const virtual: Entry[] = process.env.STRATA_CONFIG_CONTENT
    ? [
        {
          name: "STRATA_CONFIG_CONTENT",
          source: "sourceEnvContent",
          exists: true,
          loaded: true,
          virtual: true,
        },
      ]
    : []

  return ensure([...base, ...dirs, ...env, ...dir, ...virtual], path.join(root, "strata.jsonc"), "sourceXdg")
}

export function localFiles(root: string) {
  const enabled = !process.env.STRATA_DISABLE_PROJECT_CONFIG
  const dirs = [path.join(root, ".strata"), root, path.join(root, ".stratacode"), path.join(root, ".opencode")]
  const list = dirs.flatMap((dir) => FILES.map((file) => row(path.join(dir, file), localSource(root, dir), enabled)))
  return ensure(
    list.filter((item) => item.exists),
    path.join(root, ".strata", "strata.jsonc"),
    "sourceProjectStrata",
  ).map((item) => (enabled ? item : { ...item, loaded: false }))
}

function localSource(root: string, dir: string) {
  if (dir === root) return "sourceProjectRoot"
  if (dir.endsWith(`${path.sep}.strata`)) return "sourceProjectStrata"
  if (dir.endsWith(`${path.sep}.stratacode`)) return "sourceProjectStratacode"
  return "sourceProjectOpencode"
}

export function content() {
  return `{
  "$schema": "${SCHEMA}"
}
`
}
