import { Component, createSignal, createEffect, Show, onCleanup, For } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Icon } from "@stratacode/strata-ui/icon"
import { Switch } from "@stratacode/strata-ui/switch"
import { useVSCode } from "../../context/vscode"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import type { ExtensionMessage } from "../../types/messages"
import type { ExtensionFeatureFlags } from "../../types/messages/config"

import { FEATURES, children as childFeatures, getFeature } from "./feature-registry"

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
    // Cascade: when disabling a parent, also disable all children
    if (!value) {
      for (const child of childFeatures(key)) {
        if (extensionFeatures()[child]) {
          updateExtensionFeature(child, false)
          vscode.postMessage({ type: "updateSetting", key: `features.${child}`, value: false })
        }
      }
    }
  }

  const resolveInitial = (tab?: string): keyof ExtensionFeatureFlags => {
    if (tab && getFeature(tab as keyof ExtensionFeatureFlags)) return tab as keyof ExtensionFeatureFlags
    return FEATURES[0].key
  }

  const [active, setActive] = createSignal<keyof ExtensionFeatureFlags>(resolveInitial(props.initialFeature))

  createEffect(() => {
    if (props.initialFeature) setActive(resolveInitial(props.initialFeature))
  })

  const currentFeature = () => getFeature(active())

  // ─── shared button style helper ─────────────────────────────────────────────
  const btnStyle = (key: keyof ExtensionFeatureFlags, enabled = true) => ({
    display: "flex",
    "align-items": "center",
    gap: "8px",
    padding: "10px 16px",
    background: active() === key ? "var(--vscode-list-activeSelectionBackground)" : "transparent",
    color:
      active() === key
        ? "var(--vscode-list-activeSelectionForeground)"
        : enabled
          ? "var(--vscode-foreground)"
          : "var(--vscode-descriptionForeground)",
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
    <div
      style={{ display: "flex", height: "100%", "min-height": 0, gap: "1px", background: "var(--border-weak-base)" }}
    >
      {/* ── Left pane: unified list ─────────────────────────────────────────── */}
      <div
        style={{
          width: "220px",
          background: "var(--vscode-sideBar-background)",
          display: "flex",
          "flex-direction": "column",
          overflow: "auto",
          "flex-shrink": 0,
        }}
      >
        <For each={FEATURES}>
          {(feature) => (
            <button
              type="button"
              data-testid="feature-sidebar-button"
              onClick={() => setActive(feature.key)}
              style={btnStyle(
                feature.key,
                extensionFeatures()[feature.key] &&
                  (!feature.requires || extensionFeatures()[feature.requires]),
              )}
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
      <div
        style={{
          flex: 1,
          background: "var(--vscode-editor-background)",
          padding: "20px",
          overflow: "auto",
          display: "flex",
          "flex-direction": "column",
          gap: "16px",
        }}
      >
        {/* Regular feature */}
        <Show when={currentFeature()} keyed>
          {(feature) => {
            const enabled = () => extensionFeatures()[feature.key]
            const locked = () => !!feature.requires && !extensionFeatures()[feature.requires]
            const parent = () => feature.requires && getFeature(feature.requires)
            return (
              <>
                <div
                  style={{
                    display: "flex",
                    "align-items": "flex-start",
                    "justify-content": "space-between",
                    gap: "16px",
                    "padding-bottom": "16px",
                    "border-bottom": "1px solid var(--border-weak-base)",
                  }}
                >
                  <div style={{ opacity: enabled() && !locked() ? 1 : 0.5, transition: "opacity 150ms ease" }}>
                    <h2 style={{ margin: "0 0 8px 0", "font-size": "16px", "font-weight": "600" }}>
                      {feature.label(language.t)}
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        "font-size": "13px",
                        color: "var(--vscode-descriptionForeground)",
                        "line-height": "1.4",
                      }}
                    >
                      {feature.description(language.t)}
                    </p>
                  </div>
                  <Switch
                    data-testid="master-feature-switch"
                    checked={enabled()}
                    disabled={locked()}
                    onChange={(checked) => save(feature.key, checked)}
                    hideLabel
                  >
                    {feature.label(language.t)}
                  </Switch>
                </div>

                <Show when={locked() && parent()}>
                  {(p) => (
                    <p
                      style={{
                        margin: 0,
                        padding: "8px 12px",
                        "font-size": "12px",
                        color: "var(--vscode-editorWarning-foreground)",
                        background: "var(--vscode-inputValidation-warningBackground)",
                        border: "1px solid var(--vscode-inputValidation-warningBorder)",
                        "border-radius": "4px",
                      }}
                    >
                      Requires <strong>{p().label(language.t)}</strong> to be enabled first.
                    </p>
                  )}
                </Show>

                <Show when={enabled() && !locked() && feature.component}>
                  <div data-testid={`feature-panel-${feature.key}`}>
                    <Dynamic component={feature.component} />
                  </div>
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
