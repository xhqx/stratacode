# Strata Review Plugin

This is an example Strata Code plugin extension. It demonstrates how a third-party VS Code extension can communicate with Strata Code to add new features.

## Features

- Adds a "Review Current Branch" button to the Source Control (SCM) view.
- Provides a command `strata-review.reviewBranch` in the Command Palette.
- Communicates with Strata Code using the public `StrataPluginAPI` (or fallback commands) to send the review prompt to the active chat session.

## Configuration

You can customize the prompt sent to Strata Code via VS Code settings:
- `strata-review.prompt`: The prompt template used when reviewing a branch.

## Requirements

- **Strata Code** (`stratacode.strata-code`) must be installed and active.
