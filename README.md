<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=stratacode.Strata-Code"><img src="https://raster.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace" height="20"></a>
  <a href="https://x.com/stratacode"><img src="https://raster.shields.io/badge/stratacode-000000?style=flat&logo=x&logoColor=white" alt="X (Twitter)" height="20"></a>
  <a href="https://blog.strata.ai"><img src="https://raster.shields.io/badge/Blog-555?style=flat&logo=substack&logoColor=white" alt="Substack Blog" height="20"></a>
  <a href="https://strata.ai/discord"><img src="https://raster.shields.io/badge/Join%20Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord" height="20"></a>
  <a href="https://www.reddit.com/r/stratacode/"><img src="https://raster.shields.io/badge/Join%20r%2Fstratacode-D84315?style=flat&logo=reddit&logoColor=white" alt="Reddit" height="20"></a>
</p>

<p align="center">
 <img width="250" alt="strata-code-logo" src="https://github.com/user-attachments/assets/bdb0c174-b9fd-40ad-a47b-f3aab9b54e8d" />
</p>

> Strata is the all-in-one agentic engineering platform. Build, ship, and iterate faster with the most popular open source coding agent.

- ✨ Generate code from natural language
- ✅ Checks its own work
- 🧪 Run terminal commands
- 🌐 Automate the browser
- ⚡ Inline autocomplete suggestions
- 🤖 Latest AI models
- 🎁 API keys optional

## Quick Links

- [VS Code Marketplace](https://strata.ai/vscode-marketplace?utm_source=Readme) (download)
- Install CLI: `npm install -g @stratacode/cli`
- [Official Strata.ai Home page](https://strata.ai) (learn more)

## Key Features

- **Code Generation:** Strata can generate code using natural language.
- **Inline Autocomplete:** Get intelligent code completions as you type, powered by AI.
- **Task Automation:** Strata can automate repetitive coding tasks to save time.
- **Automated Refactoring:** Strata can refactor and improve existing code efficiently.
- **MCP Server Marketplace**: Strata can easily find, and use MCP servers to extend the agent capabilities.
- **Multi Mode**: Plan with Architect, Code with Coder, and Debug with Debugger, and make your own custom modes.

## Get Started in Visual Studio Code

1. Install the Strata Code extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=stratacode.Strata-Code).
2. Create your account to access 500+ cutting-edge AI models including Gemini 3.1 Pro, Claude 4.6 Sonnet & Opus, and GPT-5.4 – with transparent pricing that matches provider rates exactly.
3. Start coding with AI that adapts to your workflow. Watch our quick-start guide to see Strata in action:

<a href="https://youtu.be/pqGfYXgrhig"><img src="https://img.youtube.com/vi/pqGfYXgrhig/maxresdefault.jpg" alt="Watch the video" width="640" height="360"></a>

## Get Started with the CLI

```bash
# npm
npm install -g @stratacode/cli

# Or run directly with npx
npx @stratacode/cli
```

Then run `strata` in any project directory to start.

<!-- stratacode_change start -->

### npm Install Note: Hidden `.strata` File

On some systems and npm versions, installing `@stratacode/cli` can create a hidden `.strata` file near the installed `strata` command (for example in a global npm bin directory). This file is an npm-generated launcher helper, not project data.

- Why it exists: npm may create helper artifacts while wiring CLI executables.
- Size caveat: size can vary by platform, npm version, and install mode (symlink vs copied launcher), so a strict fixed size is not guaranteed.
- Safety: it is safe to leave in place. Do not edit it manually. Use your package manager's uninstall (`npm uninstall -g @stratacode/cli`) to remove install artifacts cleanly.
<!-- stratacode_change end -->

### Install from GitHub Releases (Optional)

Download the latest binary or source code from the [Releases page](https://github.com/Strata-Org/stratacode/releases), use this quick guide:

- `strata-<os>-<arch>.zip` is the CLI binary for your OS and CPU architecture on Windows and macOS. (`strata-linux-<arch>.tar.gz` for Linux)
- `darwin` means macOS.
- `x64` is standard 64-bit Intel/AMD CPUs.
- `x64-baseline` is a compatibility build for older x64 CPUs(do not support AVX Instruction).
- `arm64` is ARM-based Linux/MacOS.
- `musl` is statically linked Linux build for Alpine/minimal Docker without glibc. Alpine/minimal Docker users should prefer the matching \*-musl asset.
- `strata-vscode-*.vsix` is the VS Code extension package and not the CLI binary.
- `Source code` releases are for building from source, not normal installation.

For most users:

- **Windows (most PCs):** `strata-windows-x64.zip`
- **macOS Apple Silicon:** `strata-darwin-arm64.zip`
- **macOS Intel:** `strata-darwin-x64.zip`
- **Linux x64:** `strata-linux-x64.tar.gz`
- **Linux on ARM:** `strata-linux-arm64.tar.gz`

### Autonomous Mode (CI/CD)

Use the `--auto` flag with `strata run` to enable fully autonomous operation without user interaction. This is ideal for CI/CD pipelines and automated workflows:

```bash
strata run --auto "run tests and fix any failures"
```

**Important:** The `--auto` flag disables all permission prompts and allows the agent to execute any action without confirmation. Only use this in trusted environments like CI/CD pipelines.

## Contributing

We welcome contributions from developers, writers, and enthusiasts!
To get started, please read our [Contributing Guide](/CONTRIBUTING.md). It includes details on setting up your environment, coding standards, types of contribution and how to submit pull requests.

See [RELEASING.md](RELEASING.md) for the release process.

## Code of Conduct

Our community is built on respect, inclusivity, and collaboration. Please review our [Code of Conduct](/CODE_OF_CONDUCT.md) to understand the expectations for all contributors and community members.

## License

This project is licensed under the MIT License.
You’re free to use, modify, and distribute this code, including for commercial purposes as long as you include proper attribution and license notices. See [License](/LICENSE).

### Where did Strata CLI come from?

Strata CLI is a fork of [OpenCode](https://github.com/anomalyco/opencode), enhanced to work within the Strata agentic engineering platform.
