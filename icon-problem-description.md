# VS Code Extension Icon Problem

## Summary

The VS Code extension icon configuration in `packages/strata-vscode/package.json` became unstable after several attempts to reuse the Strata comet icon across multiple UI surfaces.

## Current Situation

- The manifest currently needs to preserve these intended non-icon changes:
  - remove `strataClawOpen` from `contributes.menus["view/title"]`
  - remove `profileButtonClicked` from `contributes.menus["view/title"]`
  - remove `contributes.menus["scm/input"]`
  - move `settingsButtonClicked` in `contributes.menus["editor/title"]` from `navigation@3` to `navigation@2`
  - keep `strata-code.new.enableGateway` in configuration
- At the same time, icon asset references must only point to files that actually exist in `packages/strata-vscode/assets/icons/`

## Problem

Attempts to revert icon experiments also reverted desired menu-item changes in `package.json`.

Later attempts restored the desired menu changes, but some icon references pointed to files that had already been removed, creating a broken mixed state.

## Surfaces Involved

1. Main extension icon (`package.json > icon`)
2. Activity bar icon (`contributes.viewsContainers.activitybar`)
3. Open-in-tab command icon (`strata-code.new.openInTab`)
4. Commit generation button icon (`strata-code.new.generateCommitMessage`)
5. Autocomplete status item label/icon (`src/services/autocomplete/i18n/en.ts` + custom product icon font)

## Key Constraints

- Activity bar icons behave differently from toolbar/command icons in VS Code.
- Activity bar icons can use SVG masks, but command/button icons are more sensitive to contrast and sizing.
- Status bar text cannot directly use arbitrary image files; it relies on codicons or contributed product icons.
- Reverting `packages/strata-vscode/package.json` wholesale is unsafe because it also reverts unrelated desired manifest edits.

## What Was Tried

- Creating new comet SVG variants for the activity bar
- Renaming icon files to force VS Code cache invalidation
- Reusing the same icon for commit generation and open-in-tab
- Restoring an old custom icon font for `$(strata-logo)`
- Regenerating a custom icon font from a newer comet asset
- Reverting icon-related files back to `HEAD`
- Reapplying desired `package.json` menu/config changes manually

## Failure Mode

The hard part is not just the icon artwork itself. The real issue is keeping `package.json` in a valid state where:

1. desired menu/config changes remain intact
2. icon references point only to real assets
3. VS Code-specific rendering constraints are respected per surface

## Recommended Next Step

Handle `packages/strata-vscode/package.json` in two separate categories:

- **Manifest behavior changes**: menu/config edits that should remain
- **Icon asset wiring**: icon paths that should be changed only if the referenced files are verified to exist and are appropriate for that specific VS Code surface

Do not use broad restores on the whole file unless the desired menu/config edits are reapplied immediately afterward.
