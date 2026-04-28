# Custom Command System

**Priority:** P2

## Remaining Work

- Slash command input handling in chat (detect `/` prefix, show command list)
- Project-level command discovery (scan `.stratacode/commands/` or similar)
- YAML frontmatter metadata support
- Symlink-aware command discovery
- VS Code command palette entry points
- Wire to CLI's custom command system for execution

## Primary Implementation Anchors (stratacode-legacy)

These exist in the [stratacode-legacy](https://github.com/Strata-Org/stratacode-legacy) repo, not in this extension:

- `src/services/command/`
