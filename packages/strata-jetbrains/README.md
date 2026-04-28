# Strata JetBrains

AI coding agent plugin for JetBrains IDEs.

---

## Set up your environment

### Prerequisites

- **Bun** -- used to build CLI binaries and run build scripts
- **JDK 21+** -- required by Gradle and the IntelliJ Platform SDK
- **IntelliJ IDEA** -- to run the plugin in a sandboxed IDE

---

## Open in IntelliJ

When you open the monorepo root in IntelliJ IDEA, the Gradle project at `packages/strata-jetbrains/` should be auto-detected via `.idea/gradle.xml`. If not, link it manually: **File > Settings > Build Tools > Gradle > +** and select `packages/strata-jetbrains/settings.gradle.kts`.

---

## Build locally

From `packages/strata-jetbrains/`:

```
bun run build
```

This builds the CLI binary for your current OS/arch only, copies it into the backend module resources, and runs `./gradlew buildPlugin`. The plugin archive is output to `build/distributions/`.

Or via Turbo from the repo root:

```
bun turbo build --filter=@stratacode/strata-jetbrains
```

---

## Build for production

From `packages/strata-jetbrains/`:

```
bun run build:production
```

This builds CLI binaries for all 6 desktop platforms (darwin-arm64, darwin-x64, linux-arm64, linux-x64, windows-x64, windows-arm64), copies them all into the backend jar, and fails if any are missing. Gradle also validates all platforms are present via `-Pproduction=true`.

The built plugin archive is at `build/distributions/strata.jetbrains-<version>.zip`. This zip can be installed in any JetBrains IDE via **Settings > Plugins > Install Plugin from Disk**.

---

## Run the plugin

Use the `runIde` Gradle task (available in the Gradle tool window or via the "Run JetBrains Plugin" run configuration) to launch a sandboxed IntelliJ instance with the plugin installed.

On a fresh worktree, `runIde` now checks `backend/build/generated/cli/cli/` first. If the local-platform CLI binary is missing, it runs the standard single-binary generation flow and copies the result into the backend resources automatically.

That bootstrap is local-development only. Production packaging still requires running `bun run build:production` so all platform binaries are present.

### Debug logging properties

The plugin supports a few JVM system properties for local debugging. These are most useful with `runIde` in sandbox mode because the logs are mirrored to `strata-dev.log` files for frontend and backend.

`strata.dev.log.level`

- Controls the Strata debug file logger level.
- Supported values: `DEBUG`, `INFO`, `WARN`, `ERROR`, `OFF`
- Default: `INFO`
- Use `DEBUG` to enable detailed chat tracing and lazy `log.debug { ... }` summaries.

`strata.dev.log.chat.content`

- Controls how much chat text content appears in structured chat logs.
- Supported values:
  - `off`: no text previews, metadata only
  - `preview`: sanitized truncated previews
  - `full`: sanitized full content
- Default: `off`

`strata.dev.log.chat.preview.max`

- Maximum preview size when `strata.dev.log.chat.content=preview`
- Default: `160`

Where to find the log files:

- In sandbox `runIde` runs, Strata writes separate dev log files for each side under the IDE sandbox log directory reported by `PathManager.getLogDir()`.
- Frontend log file: `<sandbox log dir>/strata-frontend/strata-dev.log`
- Backend log file: `<sandbox log dir>/strata-backend/strata-dev.log`
- In practice these sit under the current `log_run*` sandbox logs for the active run.
- If you are unsure of the exact sandbox root, open the IDE log directory from the running sandbox instance and then look for the `strata-frontend/` and `strata-backend/` subdirectories.

Recommended combinations:

```text
-Dstrata.dev.log.level=DEBUG -Dstrata.dev.log.chat.content=off
```

```text
-Dstrata.dev.log.level=DEBUG -Dstrata.dev.log.chat.content=preview -Dstrata.dev.log.chat.preview.max=120
```

Use `off` first. Switch to `preview` only when you need prompt or tool payload hints to diagnose a problem. Use `full` only for short local reproductions because logs can grow quickly.

---

## Run Gradle directly

You can run `./gradlew buildPlugin` directly for local development. Gradle will auto-generate the current-platform CLI binary if `backend/build/generated/cli/` is missing.

For production verification:

```
./gradlew buildPlugin -Pproduction=true
```
