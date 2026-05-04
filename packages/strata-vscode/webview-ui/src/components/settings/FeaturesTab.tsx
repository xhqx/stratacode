import { Component, createSignal, createEffect, Show, onCleanup, For } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Icon, type IconProps } from "@stratacode/strata-ui/icon"
import { Switch } from "@stratacode/strata-ui/switch"
import { useVSCode } from "../../context/vscode"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"
import type { ExtensionFeatureFlags } from "../../types/messages/config"

import { FEATURES } from "./feature-registry"

export interface FeaturesTabProps {
  initialFeature?: string
}

const FeaturesTab: Component<FeaturesTabProps> = (props) => {
  const vscode = useVSCode()
  const { extensionFeatures, updateExtensionFeature } = useConfig()
  const language = useLanguage()

  const unsubscribe = vscode.onMessage((_message: ExtensionMessage) => {})
  onCleanup(unsubscribe)

  const save = (key: keyof ExtensionFeatureFlags, value: boolean) => {
    updateExtensionFeature(key, value)
    vscode.postMessage({ type: "updateSetting", key: `features.${key}`, value })
  }

  const resolveInitial = (tab?: string): keyof ExtensionFeatureFlags => {
    if (tab && FEATURES.find(f => f.key === tab)) return tab as keyof ExtensionFeatureFlags
    return FEATURES[0].key
  }

  const [active, setActive] = createSignal<keyof ExtensionFeatureFlags>(resolveInitial(props.initialFeature))

  createEffect(() => {
    if (props.initialFeature) setActive(resolveInitial(props.initialFeature))
  })

  const currentFeature = () => FEATURES.find(f => f.key === active())

  // ─── shared button style helper ─────────────────────────────────────────────
  const btnStyle = (key: keyof ExtensionFeatureFlags, enabled = true) => ({
    display: "flex",
    "align-items": "center",
    gap: "8px",
    padding: "10px 16px",
    background: active() === key ? "var(--vscode-list-activeSelectionBackground)" : "transparent",
    color: active() === key
      ? "var(--vscode-list-activeSelectionForeground)"
      : enabled ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)",
    border: "none",
    "border-left": `3px solid ${active() === key ? "var(--vscode-focusBorder)" : "transparent"}`,
    cursor: "pointer",
    "text-align": "left" as const,
    "font-size": "13px",
    "font-family": "inherit",
    width: "100%",
    transition: "background 120ms ease, color 120ms ease",
    opacity: enabled ? 1 : 0.6,
  })

  return (
    <div style={{ display: "flex", height: "100%", "min-height": 0, gap: "1px", background: "var(--border-weak-base)" }}>

      {/* ── Left pane: unified list ─────────────────────────────────────────── */}
      <div style={{ width: "220px", background: "var(--vscode-sideBar-background)", display: "flex", "flex-direction": "column", overflow: "auto", "flex-shrink": 0 }}>

        <For each={FEATURES}>
          {(feature) => (
            <button
              type="button"
              onClick={() => setActive(feature.key)}
              style={btnStyle(feature.key, extensionFeatures()[feature.key])}
            >
              <Icon name={feature.icon} size="small" />
              <span style={{ flex: 1, "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                {feature.label(language.t)}
              </span>
            </button>
          )}
        </For>
      </div>

      {/* ── Right pane ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, background: "var(--vscode-editor-background)", padding: "20px", overflow: "auto", display: "flex", "flex-direction": "column", gap: "16px" }}>

        {/* Regular feature */}
        <Show when={currentFeature()} keyed>
          {(feature) => {
            const enabled = () => extensionFeatures()[feature.key]
            return (
              <>
                <div style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "16px", "padding-bottom": "16px", "border-bottom": "1px solid var(--border-weak-base)" }}>
                  <div style={{ opacity: enabled() ? 1 : 0.5, transition: "opacity 150ms ease" }}>
                    <h2 style={{ margin: "0 0 8px 0", "font-size": "16px", "font-weight": "600" }}>{feature.label(language.t)}</h2>
                    <p style={{ margin: 0, "font-size": "13px", color: "var(--vscode-descriptionForeground)", "line-height": "1.4" }}>{feature.description(language.t)}</p>
                  </div>
                  <Switch
                    checked={enabled()}
                    onChange={(checked) => save(feature.key, checked)}
                    hideLabel
                  >
                    {feature.label(language.t)}
                  </Switch>
                </div>

                <Show when={enabled() && feature.component}>
                  <Dynamic component={feature.component} />
                </Show>
              </>
            )
          }}
        </Show>


      </div>
    </div>
  )
}

export default FeaturesTab
