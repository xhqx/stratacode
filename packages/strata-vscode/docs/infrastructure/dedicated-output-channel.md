# Dedicated Output Channel

**Priority:** P2

Agent Manager has its own output channel. No general "Strata Code" output channel exists.

## Remaining Work

- Create `vscode.window.createOutputChannel("Strata Code")` during activation
- Centralized logging utility with log levels (debug, info, warn, error)
- Route all `[Strata New]` log messages to this channel
- Dispose on deactivation
- Migrate existing `console.log("[Strata New] ...")` calls to the logger
