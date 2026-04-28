// stratacode_change - new file
/**
 * Strata-specific overrides for the provider dialog.
 *
 * Exports constants and renderers consumed by the shared upstream
 * `dialog-provider.tsx` so the upstream diff stays minimal.
 */

import type { JSX } from "solid-js"
import type { RGBA } from "@opentui/core"
import type { ProviderAuthAuthorization } from "@stratacode/sdk/v2"
import { StrataAutoMethod } from "@/stratacode/components/dialog-strata-auto-method"

// ---------------------------------------------------------------------------
// Provider priority (replaces upstream map entirely)
// ---------------------------------------------------------------------------

export const PROVIDER_PRIORITY: Record<string, number> = {
  strata: -1,
  anthropic: 0,
  "github-copilot": 1,
  openai: 2,
  google: 3,
}

// ---------------------------------------------------------------------------
// Provider descriptions shown next to the name in the selection list
// ---------------------------------------------------------------------------

export const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  strata: "(Recommended)",
  anthropic: "(Claude Max or API key)",
  openai: "(ChatGPT login or API key)",
}

export const PROVIDER_TITLES: Record<string, string> = {
  openai: "OpenAI / Codex",
}

// ---------------------------------------------------------------------------
// Auto-method renderer
// ---------------------------------------------------------------------------

/**
 * If the provider is Strata Gateway, renders the custom `StrataAutoMethod`
 * component that handles device-auth + org selection.
 *
 * Returns `undefined` for every other provider so the caller can fall
 * through to the default `AutoMethod`.
 */
export function renderAutoMethod(opts: {
  providerID: string
  title: string
  index: number
  authorization: ProviderAuthAuthorization
  useSDK: () => any
  useTheme: () => any
  DialogModel: any
}): (() => JSX.Element) | undefined {
  if (opts.providerID !== "strata") return undefined
  return () => (
    <StrataAutoMethod
      providerID={opts.providerID}
      title={opts.title}
      index={opts.index}
      authorization={opts.authorization}
      useSDK={opts.useSDK}
      useTheme={opts.useTheme}
      DialogModel={opts.DialogModel}
    />
  )
}

// ---------------------------------------------------------------------------
// API-key dialog description
// ---------------------------------------------------------------------------

/**
 * Returns a custom description element for the API-key dialog when the
 * provider is Strata Gateway. Returns `undefined` otherwise.
 */
export function renderApiDescription(
  providerID: string,
  theme: { textMuted: RGBA; text: RGBA; primary: RGBA },
): (() => JSX.Element) | undefined {
  if (providerID !== "strata") return undefined
  return () => (
    <box gap={1}>
      <text fg={theme.textMuted}>
        Strata Gateway gives you access to all the best coding models at the cheapest prices with a single API key.
      </text>
      <text fg={theme.text}>
        Go to <span style={{ fg: theme.primary }}>https://strata.ai/gateway</span> to get a key
      </text>
    </box>
  )
}
