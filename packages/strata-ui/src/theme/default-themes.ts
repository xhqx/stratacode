import type { DesktopTheme } from "@opencode-ai/ui/theme/types"
import { DEFAULT_THEMES as UPSTREAM_THEMES } from "@opencode-ai/ui/theme/default-themes"
import strataJson from "./themes/strata.json"
import strataVscodeJson from "./themes/strata-vscode.json"

// Re-export all upstream theme constants
export {
  oc2Theme,
  tokyonightTheme,
  draculaTheme,
  monokaiTheme,
  solarizedTheme,
  nordTheme,
  catppuccinTheme,
  ayuTheme,
  oneDarkProTheme,
  shadesOfPurpleTheme,
  nightowlTheme,
  vesperTheme,
  carbonfoxTheme,
  gruvboxTheme,
  auraTheme,
} from "@opencode-ai/ui/theme/default-themes"

export const strataTheme = strataJson as DesktopTheme
export const strataVscodeTheme = strataVscodeJson as DesktopTheme

export const STRATA_THEMES: Record<string, DesktopTheme> = {
  strata: strataTheme,
  "strata-vscode": strataVscodeTheme,
}

// Override DEFAULT_THEMES: Strata themes first, then upstream
export const DEFAULT_THEMES: Record<string, DesktopTheme> = {
  ...STRATA_THEMES,
  ...UPSTREAM_THEMES,
}
