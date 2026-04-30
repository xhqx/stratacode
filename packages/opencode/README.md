# Strata Code CLI

The AI coding agent built for the terminal. Generate code from natural language, automate tasks, and run terminal commands -- powered by 500+ AI models.

## Install

```bash
npm install -g @stratacode/cli
```

Or run directly with npx:

```bash
npx --package @stratacode/cli strata
```

## Getting Started

Run `strata` in any project directory to launch the interactive TUI:

```bash
strata
```

Run a one-off task:

```bash
strata run "add input validation to the signup form"
```

## Features

- **Code generation** -- describe what you want in natural language
- **Terminal commands** -- the agent can run shell commands on your behalf
- **500+ AI models** -- use models from OpenAI, Anthropic, Google, and more
- **MCP servers** -- extend agent capabilities with the Model Context Protocol
- **Multiple modes** -- Plan with Architect, code with Coder, debug with Debugger, or create your own
- **Sessions** -- resume previous conversations and export transcripts
- **API keys optional** -- bring your own keys or use Strata credits

## Commands

| Command                 | Description                |
| ----------------------- | -------------------------- |
| `strata`                | Launch interactive TUI     |
| `strata run "<task>"`   | Run a one-off task         |
| `strata auth`           | Manage authentication      |
| `strata models`         | List available models      |
| `strata mcp`            | Manage MCP servers         |
| `strata session list`   | List sessions              |
| `strata session delete` | Delete a session           |
| `strata export`         | Export session transcripts |

Run `strata --help` for the full list.

## Alternative Installation

### Homebrew (macOS/Linux)

```bash
brew install Strata-Org/tap/strata
```

### GitHub Releases

Download pre-built binaries from the [Releases page](https://github.com/Strata-Org/stratacode/releases).

## Documentation

- [Docs](https://strata.ai/docs)
- [Getting Started](https://strata.ai/docs/getting-started)

## Links

- [GitHub](https://github.com/Strata-Org/stratacode)
- [Discord](https://strata.ai/discord)
- [VS Code Extension](https://strata.ai/vscode-marketplace)
- [Website](https://strata.ai)

## License

MIT
