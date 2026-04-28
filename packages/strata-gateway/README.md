# @stratacode/strata-gateway

Unified Strata Gateway package for OpenCode providing authentication, AI provider integration, and API access.

## Features

- **Authentication**: Device authorization flow for Strata Gateway
- **AI Provider**: OpenRouter-based provider with Strata Gateway integration
- **API Integration**: Profile, balance, and model management
- **TUI Helpers**: Utilities for terminal UI components

## Installation

```bash
bun add @stratacode/strata-gateway
```

## Usage

### Plugin Registration

```typescript
import { StrataAuthPlugin } from "@stratacode/strata-gateway"

// Register with OpenCode
const plugins = [StrataAuthPlugin]
```

### Provider Usage

```typescript
import { createStrata } from "@stratacode/strata-gateway"

const provider = createStrata({
  stratacodeToken: process.env.STRATACODE_API_KEY,
  stratacodeOrganizationId: "org-123",
})

const model = provider.languageModel("anthropic/claude-sonnet-4")
```

### API Access

```typescript
import { fetchProfile, fetchBalance } from "@stratacode/strata-gateway"

const profile = await fetchProfile(token)
const balance = await fetchBalance(token)
```

## License

MIT
