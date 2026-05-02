import * as path from "path"
import * as os from "os"
import * as fs from "fs"

/**
 * Global config dir: ~/.config/strata/ (XDG_CONFIG_HOME/strata)
 * This matches where the CLI reads global config from.
 */
function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(xdg, "strata")
}

/**
 * Resolve the global config file path. The CLI checks strata.jsonc before
 * strata.json (see config.ts `globalConfigFile()`). We must match that
 * priority order so reads/writes target the same file the CLI uses.
 */
function globalConfigPath(): string {
  const dir = globalConfigDir()
  const jsonc = path.join(dir, "strata.jsonc")
  if (fs.existsSync(jsonc)) return jsonc
  return path.join(dir, "strata.json")
}

export class MarketplacePaths {
  /** Project-scope config file: <workspace>/.strata/strata.json */
  configPath(scope: "project" | "global", workspace?: string): string {
    if (scope === "project") return path.join(workspace!, ".strata", "strata.json")
    return globalConfigPath()
  }

  /** Skill install directory (where the marketplace installer writes to). */
  skillsDir(scope: "project" | "global", workspace?: string): string {
    if (scope === "project") return path.join(workspace!, ".strata", "skills")
    return path.join(os.homedir(), ".strata", "skills")
  }
}
