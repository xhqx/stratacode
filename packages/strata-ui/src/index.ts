//
// @stratacode/strata-ui
//
// Theme and style override layer for @opencode-ai/ui that matches the
// visual style of the legacy Strata Code VS Code extension.
//
// Two themes are provided:
// - strata:        For web/desktop (light + dark variants from legacy VS Code themes) [DEFAULT]
// - strata-vscode: For the VS Code extension (adapts to user's VS Code theme)
//
// This package mirrors @opencode-ai/ui's structure exactly. All component imports
// are re-exported from @opencode-ai/ui by default, and can be individually overridden
// by replacing the re-export with a custom implementation.

export { STRATA_THEMES, strataTheme, strataVscodeTheme } from "./theme/default-themes"

export type { DesktopTheme } from "@opencode-ai/ui/theme/types"
