# Feature Settings Factory Pattern — Backend (Extension Host)

Refactor the extension host so **features self-describe their settings, config sync, and message handling** using a Factory Pattern. Pull scattered feature logic out of the 4555-line `StrataProvider` monolith into cohesive, self-contained feature classes.

## Problem

Feature behavior is scattered across three locations with no encapsulation:

### 1. `StrataProvider.ts` — God class (4555 lines)

| Concern                  | Location                                                                                                                                                     | Example                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Setting side-effects** | [handleUpdateSetting](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts#L3703-L3745)                | Growing if-chain: `if (key === "features.workers")`, `if (key === "features.browserAutomation")`, etc.                                  |
| **Config sync**          | [onDidChangeConfiguration](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts#L701-L751)             | Manually checks `affectsConfiguration` for workers, features, agents                                                                    |
| **State push**           | Scattered `send*()` methods                                                                                                                                  | `sendBrowserSettings()`, `sendNotificationSettings()`, `sendTimelineSetting()`, `sendClaudeCompatSetting()` — each is a separate method |
| **Message dispatch**     | Giant switch in [onDidReceiveMessage](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts#L753-L1260) | `requestBrowserSettings`, `requestNotificationSettings`, `requestTimelineSetting`, etc. — each feature adds its own case                |

### 2. `extension.ts` — Conditional registration

```typescript
// extension.ts — scattered if (isEnabled("x")) blocks
if (isEnabled("agentManager")) { /* 30 lines of command registration */ }
if (isEnabled("autocomplete")) { registerAutocompleteProvider(...) }
if (isEnabled("commitMessage")) { registerCommitMessageService(...) }
if (isEnabled("codeActions")) { /* 15 lines */ }
if (isEnabled("diffViewer")) { registerExplainChangeCommands(...) }
```

### 3. `handleUpdateSetting` — Growing if-chain

Every new feature that needs a side-effect when its toggle changes must add another `if` branch here:

```typescript
// StrataProvider.ts L3707-3744 — each feature adds a branch
if (key === "features.workers") { ... }
if (key === "features.explainerWorker" && !value) { ... }
if (key === "features.browserAutomation") { ... }
if (key === "features.promptAutocomplete") { ... }
if (key === "features.batchTool") { ... }
if (key === "features.formatter") { ... }
if (key === "features.autoretries") { ... }
```

**This doesn't scale.** Every new feature requires touching `StrataProvider.ts`, `extension.ts`, and often `strata-provider-utils.ts`.

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Feature (interface)                  │
│                                                         │
│  id: FeatureKey                                         │
│  configKeys: string[]         // what config I watch    │
│  messageTypes: string[]       // what messages I handle │
│                                                         │
│  activate(ctx)                // register commands etc. │
│  deactivate()                 // cleanup                │
│  onConfigChanged(e)           // react to config change │
│  onToggled(enabled)           // side-effect on toggle  │
│  handleMessage(msg) → bool    // consume webview msgs   │
│  pushState(post)              // send my state to UI    │
└────────────┬────────────────────────────────────────────┘
             │ implements
             ▼
┌────────────────────────┐  ┌────────────────────────┐
│  BrowserFeature        │  │  WorkersFeature        │
│  - register MCP server │  │  - sync worker config  │
│  - handle browser msgs │  │  - manage WorkerWatcher│
│  - push browser state  │  │  - handle worker msgs  │
└────────────────────────┘  └────────────────────────┘
┌────────────────────────┐  ┌────────────────────────┐
│  NotificationsFeature  │  │  AutoretriesFeature    │
│  - push notif settings │  │  - sync retry config   │
└────────────────────────┘  └────────────────────────┘

             ▲ created by
┌────────────┴────────────────────────────────────────────┐
│                   FeatureFactory                        │
│                                                         │
│  create(id, ctx) → Feature                              │
│  createAll(ctx) → Map<FeatureKey, Feature>              │
│                                                         │
│  routeMessage(msg) → bool   // delegate to features     │
│  routeConfig(e)             // delegate to features     │
│  routeToggle(key, value)    // delegate to features     │
│  pushAll(post)              // ask all to push state    │
│  disposeAll()               // cleanup all features     │
└─────────────────────────────────────────────────────────┘

             ▲ used by
┌────────────┴────────────────────────────────────────────┐
│                   StrataProvider                         │
│                                                         │
│  - Delegates to factory.routeMessage() in switch        │
│  - Delegates to factory.routeConfig() in config handler │
│  - Delegates to factory.routeToggle() in updateSetting  │
│  - Calls factory.pushAll() in syncWebviewState          │
└─────────────────────────────────────────────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> **Incremental migration.** Each feature is extracted one at a time. The factory has a `routeMessage()` fallback — if no feature claims a message, StrataProvider handles it as before. Zero big-bang risk.

> [!WARNING]
> **StrataProvider stays the host.** We're pulling behavior OUT of it, not replacing it. The factory is composed inside StrataProvider, not a parallel system. This avoids touching the upstream-shared StrataProvider structure more than necessary (minimizes stratacode_change surface).

## Open Questions

1. **Feature activation in extension.ts vs StrataProvider?** Currently `extension.ts` does conditional command registration (`if (isEnabled("agentManager"))`). Should `Feature.activate()` own command registration too, or keep that in `extension.ts` and limit features to config/message handling only?

2. **Existing service classes?** `BrowserAutomationService`, `AutocompleteServiceManager`, `WorkerWatcher` already exist as proper classes. Should Feature classes wrap/compose these, or should we convert them into Feature subclasses?

3. **Scope of Phase 1?** We could start with just the `handleUpdateSetting` side-effects (the lowest-risk extraction), or go broader and include message routing too. What's your preference?

---

## Feature Inventory

### Already encapsulated (services exist, wrap with Feature adapter)

| Feature Key         | Service Class                                                                                                                                                                  | Side-effects in StrataProvider                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `browserAutomation` | [BrowserAutomationService](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/services/browser-automation/browser-automation-service.ts) | `handleUpdateSetting` syncs `browserAutomation.enabled`; `sendBrowserSettings()` pushes state; handles `requestBrowserSettings` message |
| `autocomplete`      | `AutocompleteServiceManager`                                                                                                                                                   | `routeAutocompleteMessage()` in message handler; `watchAutocompleteConfig()` in config handler                                          |
| `workers`           | [WorkerWatcher](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/services/worker/WorkerWatcher.ts)                                     | 40-line `onDidChangeConfiguration` block syncs 6 worker config keys to CLI backend                                                      |
| `commitMessage`     | `registerCommitMessageService()`                                                                                                                                               | Guarded by `isEnabled()` in `extension.ts`                                                                                              |

### Inlined in StrataProvider (no service class — extract first)

| Feature Key          | What's inlined                                                                                    | Lines      |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| `autoretries`        | `handleUpdateSetting` syncs `retry.enabled` to CLI                                                | L3740-3744 |
| `batchTool`          | `handleUpdateSetting` syncs `experimental.batch_tool` to CLI                                      | L3730-3734 |
| `formatter`          | `handleUpdateSetting` syncs `formatter` to CLI                                                    | L3735-3739 |
| `promptAutocomplete` | `handleUpdateSetting` syncs `enableChatAutocomplete` to VS Code settings                          | L3725-3729 |
| `explainerWorker`    | `handleUpdateSetting` force-disables `workers.autoExplain` when toggled off                       | L3715-3719 |
| `notifications`      | `sendNotificationSettings()` + handles `requestNotificationSettings` message                      | scattered  |
| `diffViewer`         | `sendTimelineSetting()` + handles `requestTimelineSetting` message + `requestClaudeCompatSetting` | scattered  |

### Keep in StrataProvider (core session/connection concerns)

These are NOT features — they're core infrastructure:

- Session management, SSE event routing, connection lifecycle
- Profile/auth (already properly gated via `isEnabled("strataAuth")`)
- Plugin registry integration
- File search, terminal context

---

## Proposed Changes

### Feature Interface

#### [NEW] [feature.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/feature.ts)

```typescript
import type * as vscode from "vscode"
import type { StrataClient } from "@stratacode/sdk/v2/client"
import type { FeatureKey } from "./feature-defaults"

export type PostMessage = (msg: Record<string, unknown>) => void

export interface FeatureContext {
  /** VS Code extension context for registering commands/disposables */
  extension: vscode.ExtensionContext
  /** SDK client (may be null if not connected) */
  client: StrataClient | null
  /** Post a message to the webview */
  post: PostMessage
  /** Read a VS Code configuration value */
  config: typeof vscode.workspace.getConfiguration
}

export interface Feature extends vscode.Disposable {
  readonly id: FeatureKey

  /** VS Code config sections this feature reacts to (e.g. "strata-code.new.workers") */
  readonly configKeys: readonly string[]

  /** Webview message types this feature handles (e.g. "requestBrowserSettings") */
  readonly messageTypes: readonly string[]

  /** Called when the feature is activated. Register commands, watchers, etc. */
  activate(ctx: FeatureContext): void

  /** Called when onDidChangeConfiguration fires for a key in configKeys */
  onConfigChanged(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void

  /** Called when the feature toggle itself is changed. Perform side effects. */
  onToggled(enabled: boolean, ctx: FeatureContext): Promise<void>

  /** Handle a webview message. Return true if consumed. */
  handleMessage(msg: Record<string, unknown>, ctx: FeatureContext): boolean

  /** Push current state to webview (called during syncWebviewState) */
  pushState(ctx: FeatureContext): void
}
```

---

### Feature Factory

#### [NEW] [feature-factory.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/feature-factory.ts)

```typescript
export class FeatureFactory {
  private features = new Map<FeatureKey, Feature>()
  private msgIndex = new Map<string, Feature>()
  private cfgIndex = new Map<string, Feature[]>()

  register(feature: Feature): void {
    /* index by messageTypes + configKeys */
  }

  /** Delegate a webview message to the right feature. Returns true if handled. */
  routeMessage(msg: Record<string, unknown>, ctx: FeatureContext): boolean

  /** Delegate config changes to all affected features. */
  routeConfig(e: ConfigurationChangeEvent, ctx: FeatureContext): void

  /** Delegate feature toggle side-effects. */
  routeToggle(key: FeatureKey, enabled: boolean, ctx: FeatureContext): Promise<void>

  /** Ask all features to push state (called during syncWebviewState). */
  pushAll(ctx: FeatureContext): void

  dispose(): void
}
```

---

### Concrete Feature Classes (Phase 2)

#### [NEW] [features/browser.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/features/browser.ts)

Wraps existing `BrowserAutomationService`. Handles:

- `requestBrowserSettings` → `sendBrowserSettings()` (moved from StrataProvider L3804-3813)
- `onToggled()` → syncs `browserAutomation.enabled` VS Code setting
- `configKeys: ["strata-code.new.browserAutomation"]`

#### [NEW] [features/workers.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/features/workers.ts)

Encapsulates the 40-line `onDidChangeConfiguration` block (StrataProvider L710-750). Handles:

- 6 worker config keys → syncs to CLI via `client.global.config.update()`
- `onToggled()` → syncs `workers.enabled` VS Code setting
- `configKeys: ["strata-code.new.workers"]`

#### [NEW] [features/retries.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/features/retries.ts)

Extracts from handleUpdateSetting L3740-3744:

- `onToggled()` → `client.global.config.update({ retry: { enabled } })`

#### [NEW] [features/batch.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/features/batch.ts)

Extracts from handleUpdateSetting L3730-3734:

- `onToggled()` → `client.global.config.update({ experimental: { batch_tool } })`

#### [NEW] [features/formatter.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/features/formatter.ts)

Extracts from handleUpdateSetting L3735-3739:

- `onToggled()` → `client.global.config.update({ formatter: value ? {} : false })`

#### [NEW] [features/notifications.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/stratacode/features/notifications.ts)

Moves `sendNotificationSettings()` + handles `requestNotificationSettings` message.

---

### StrataProvider Integration

#### [MODIFY] [StrataProvider.ts](file:///Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts)

1. **Add factory field:**

```typescript
private factory = new FeatureFactory()
```

2. **In constructor/activate:** Register feature classes

```typescript
this.factory.register(new BrowserFeature(this.browserAutomationService))
this.factory.register(new WorkersFeature())
this.factory.register(new RetriesFeature())
// etc.
```

3. **In message handler:** Add early delegation before the switch

```typescript
if (this.factory.routeMessage(message, this.featureCtx)) return
```

4. **In `handleUpdateSetting`:** Replace if-chain with factory delegation

```typescript
if (key.startsWith("features.")) {
  const featureKey = key.replace("features.", "") as FeatureKey
  await this.factory.routeToggle(featureKey, value as boolean, this.featureCtx)
}
```

5. **In `onDidChangeConfiguration`:** Delegate to factory

```typescript
this.factory.routeConfig(e, this.featureCtx)
```

6. **In `syncWebviewState`:** Add factory push

```typescript
this.factory.pushAll(this.featureCtx)
```

---

## Migration Phases

### Phase 1: Infrastructure (Feature interface + FeatureFactory)

- Create `feature.ts` interface
- Create `feature-factory.ts` class
- Wire into StrataProvider with delegation hooks (no behavior change yet)
- All existing code continues to work — factory is additive

### Phase 2: Extract trivial features

- `RetriesFeature`, `BatchFeature`, `FormatterFeature` — each is 3-5 lines of `onToggled()` logic
- Delete corresponding if-branches from `handleUpdateSetting`
- Verify with typecheck

### Phase 3: Extract medium features

- `BrowserFeature` — wraps existing service + moves `sendBrowserSettings()` + message handler
- `WorkersFeature` — moves 40-line config sync block
- `NotificationsFeature` — moves `sendNotificationSettings()` + message handler
- Delete extracted methods and message cases from StrataProvider

### Phase 4: Extract complex features (optional, future)

- `AutocompleteFeature` — wraps AutocompleteServiceManager
- Consider extracting command registration from `extension.ts` into `Feature.activate()`

---

## Verification Plan

### Automated Tests

```bash
# Typecheck
bun turbo typecheck

# Existing feature graph tests
bun test test/feature-graph.test.ts --cwd packages/opencode

# E2E settings UI (existing Playwright suite)
bun test tests/features-e2e.spec.ts --cwd packages/strata-vscode
```

### Unit Tests for Feature Classes

```bash
# New: test each feature's onToggled/handleMessage/pushState in isolation
bun test test/stratacode/features/ --cwd packages/strata-vscode
```

### Manual Verification

1. Toggle `browserAutomation` → verify MCP server registers/unregisters as before
2. Toggle `workers` → verify `workers.enabled` config syncs to CLI backend
3. Toggle `autoretries` → verify `retry.enabled` config syncs to CLI backend
4. Toggle `batchTool` → verify `experimental.batch_tool` syncs
5. Toggle `formatter` → verify `formatter` config syncs
6. Open settings → verify `requestBrowserSettings`, `requestNotificationSettings` still push state
7. All `strata-code.new.*` config changes still trigger proper side-effects
