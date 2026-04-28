import * as path from "path"
import * as os from "os"

/**
 * Global config dir: ~/.config/strata/ (XDG_CONFIG_HOME/strata)
 * This matches where the CLI reads global config from.
 */
function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(xdg, "strata")
}

export class MarketplacePaths {
  /** Project-scope config file: <workspace>/.strata/strata.json */
  configPath(scope: "project" | "global", workspace?: string): string {
    if (scope === "project") return path.join(workspace!, ".strata", "strata.json")
    return path.join(globalConfigDir(), "strata.json")
  }

  /** Skill install directory (where the marketplace installer writes to). */
  skillsDir(scope: "project" | "global", workspace?: string): string {
    if (scope === "project") return path.join(workspace!, ".strata", "skills")
    return path.join(os.homedir(), ".strata", "skills")
  }
}
