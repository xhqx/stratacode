import { describe, expect, it } from "bun:test"

import {
  disabledProviderOptions,
  providersWithStrataFallback,
  visibleConnectedIds,
} from "../../webview-ui/src/components/settings/provider-visibility"

describe("visibleConnectedIds", () => {
  it("hides Strata from the connected list when auth is missing", () => {
    const ids = visibleConnectedIds(["strata", "openrouter"], { openrouter: "api" })

    expect(ids).toEqual(["openrouter"])
  })

  it("keeps Strata in the connected list when auth exists", () => {
    const ids = visibleConnectedIds(["strata", "openrouter"], { strata: "oauth", openrouter: "api" })

    expect(ids).toEqual(["strata", "openrouter"])
  })

  it("leaves non-Strata providers untouched", () => {
    const ids = visibleConnectedIds(["anthropic"], {})

    expect(ids).toEqual(["anthropic"])
  })
})

describe("disabledProviderOptions", () => {
  it("includes Strata and excludes already disabled providers", () => {
    const options = disabledProviderOptions(
      {
        strata: { id: "strata", name: "Strata Gateway", env: [], models: {} },
        openai: { id: "openai", name: "OpenAI", env: [], models: {} },
        anthropic: { id: "anthropic", name: "Anthropic", env: [], models: {} },
      },
      ["openai"],
    )

    expect(options).toEqual([
      { value: "anthropic", label: "Anthropic" },
      { value: "strata", label: "Strata Gateway" },
    ])
  })

  it("sorts options by provider name", () => {
    const options = disabledProviderOptions(
      {
        zed: { id: "zed", name: "Zed", env: [], models: {} },
        alpha: { id: "alpha", name: "Alpha", env: [], models: {} },
      },
      [],
    )

    expect(options).toEqual([
      { value: "alpha", label: "Alpha" },
      { value: "zed", label: "Zed" },
    ])
  })
})

describe("providersWithStrataFallback", () => {
  it("adds Strata when backend providers omit it", () => {
    const providers = providersWithStrataFallback({
      anthropic: { id: "anthropic", name: "Anthropic", env: [], models: {} },
    })

    expect(providers.strata?.name).toBe("Strata Gateway")
    expect(providers.anthropic?.name).toBe("Anthropic")
  })

  it("keeps the backend Strata provider when present", () => {
    const providers = providersWithStrataFallback({
      strata: { id: "strata", name: "Custom Strata Name", env: [], models: {} },
    })

    expect(providers.strata?.name).toBe("Custom Strata Name")
  })
})
