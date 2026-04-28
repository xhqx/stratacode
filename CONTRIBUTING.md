# Contributing to Strata CLI

See [the Documentation for details on contributing](https://strata.ai/docs/contributing).

## TL;DR

There are lots of ways to contribute to the project:

- **Code Contributions:** Implement new features or fix bugs
- **Documentation:** Improve existing docs or create new guides
- **Bug Reports:** Report issues you encounter
- **Feature Requests:** Suggest new features or improvements
- **Community Support:** Help other users in the community

The Strata Community is [on Discord](https://strata.ai/discord).

## Developing Strata CLI

- **Requirements:** Bun 1.3.10+
- Install dependencies and start the dev server from the repo root:

  ```bash
  bun install
  bun dev
  ```

### Developing the VS Code Extension

Build and launch the extension in an isolated VS Code instance:

```bash
bun run extension        # Build + launch in dev mode
```

This auto-detects VS Code on macOS, Linux, and Windows. Override with `--app-path PATH` or `VSCODE_EXEC_PATH`. Use `--insiders` to prefer Insiders, `--workspace PATH` to open a specific folder, or `--clean` to reset cached state.

### Running against a different directory

By default, `bun dev` runs Strata CLI in the `packages/opencode` directory. To run it against a different directory or repository:

```bash
bun dev <directory>
```

To run Strata CLI in the root of the repo itself:

```bash
bun dev .
```

### Running Strata CLI from any folder

`bin/stratadev` is a self-locating launcher that runs this checkout from wherever you invoke it. Running it with no arguments launches the TUI pointed at the caller's directory; any arguments are forwarded to the CLI unchanged.

One-shot install (recommended). From the repo root:

```bash
./bin/stratadev dev-setup
```

This detects your shell, shows exactly what it will add, asks for confirmation, writes an idempotent block to your rc file, and saves a timestamped backup of the original. Re-running is safe — it only rewrites when the snippet has changed.

Useful flags:

- `--yes` — skip the confirmation prompt (good for CI/containers).
- `--print` — just print the snippet, don't touch any file (pipe-friendly).
- `--dry-run` — show what would change without writing.
- `--shell <zsh|bash|fish|powershell>` — override shell detection.
- `--rc <path>` — override the rc file.

Manual alternatives (equivalent, no CLI invocation needed):

- Unix: add `alias stratadev='/path/to/stratacode/bin/stratadev'` to `~/.zshrc` / `~/.bashrc`, or `fish_add_path /path/to/stratacode/bin`.
- Windows: add `C:\path\to\stratacode\bin` to PATH (System Environment Variables), or add `function stratadev { & "C:\path\to\stratacode\bin\stratadev.cmd" @args }` to `$PROFILE`.

Then from anywhere:

```bash
cd ~/some/project
stratadev                      # opens TUI with project = ~/some/project
stratadev dev-setup --print    # prints the alias line (scripting)
stratadev run --dir "$PWD" "…" # subcommands pass through; use --dir for run/serve
```

### Building a "local" binary

To compile a standalone executable:

```bash
./packages/opencode/script/build.ts --single
```

Then run it with:

```bash
./packages/opencode/dist/@stratacode/cli-<platform>/bin/strata
```

Replace `<platform>` with your platform (e.g., `darwin-arm64`, `linux-x64`).

### Understanding bun dev vs strata

During development, `bun dev` is the local equivalent of the built `strata` command. Both run the same CLI interface:

```bash
# Development (from project root)
bun dev --help           # Show all available commands
bun dev serve            # Start headless API server

# Production
strata --help          # Show all available commands
strata serve           # Start headless API server
```

### Testing with a local backend

To point the CLI at a local backend (e.g., a locally running Strata API server on port 3000), set the `STRATA_API_URL` environment variable:

```bash
STRATA_API_URL=http://localhost:3000 bun dev
```

This redirects all gateway traffic (auth, model listing, provider routing, profile, etc.) to your local server. The default is `https://api.strata.ai`.

There are also optional overrides for other services:

| Variable                  | Default                          | Purpose                                   |
| ------------------------- | -------------------------------- | ----------------------------------------- |
| `STRATA_API_URL`            | `https://api.strata.ai`            | Strata API (gateway, auth, models, profile) |
| `STRATA_SESSION_INGEST_URL` | `https://ingest.stratasessions.ai` | Session export / cloud sync               |
| `STRATA_MODELS_URL`         | `https://models.dev`             | Model metadata                            |

> **VS Code:** The repo includes a "VSCode - Run Extension (Local Backend)" launch config in `.vscode/launch.json` that sets `STRATA_API_URL=http://localhost:3000` automatically.

### Pull Request Expectations

- **Issue First Policy:** All PRs must reference an existing issue.
- **UI Changes:** Include screenshots or videos (before/after).
- **Logic Changes:** Explain how you verified it works.
- **PR Titles:** Follow conventional commit standards (`feat:`, `fix:`, `docs:`, etc.).

### Issue and PR Lifecycle

To keep our backlog manageable, we automatically close inactive issues and PRs after a period of inactivity. This isn't a judgment on quality — older items tend to lose context over time and we'd rather start fresh if they're still relevant. Feel free to reopen or create a new issue/PR if you're still working on something!

### Style Preferences

- **Functions:** Keep logic within a single function unless breaking it out adds clear reuse.
- **Destructuring:** Avoid unnecessary destructuring.
- **Control flow:** Avoid `else` statements; prefer early returns.
- **Types:** Avoid `any`.
- **Variables:** Prefer `const`.
- **Naming:** Concise single-word identifiers when descriptive.
- **Runtime APIs:** Use Bun helpers (e.g., `Bun.file()`).
