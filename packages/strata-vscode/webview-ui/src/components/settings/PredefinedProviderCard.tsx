import { Icon } from "@stratacode/strata-ui/icon"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Switch } from "@stratacode/strata-ui/switch"
import { Button } from "@stratacode/strata-ui/button"
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { AcpProviderConfig } from "../../types/messages/config"
import type { ExtensionMessage } from "../../types/messages"

interface Props {
  name: string
  item: {
    name: string
    description: string
    icon: string
    defaultModel: string
    enabled: boolean
    configuredModel: string
    status: "disconnected" | "connecting" | "connected" | "error"
    liveModels: { id: string; name: string; description?: string }[]
    env: string[]
    installed: boolean
  }
  cfg: AcpProviderConfig
  onToggle: (value: boolean) => void
  onModel: (value: string) => void
  onEnv: (key: string, value: string) => void
}

interface TestResult {
  success: boolean
  error?: string
  models: { id: string; name: string }[]
}

const PredefinedProviderCard = (props: Props) => {
  const language = useLanguage()
  const vscode = useVSCode()

  const enabled = () => props.cfg.enabled === true
  const [expanded, setExpanded] = createSignal(false)

  const [testing, setTesting] = createSignal(false)
  const [result, setResult] = createSignal<TestResult | null>(null)

  const unsub = vscode.onMessage((msg: ExtensionMessage) => {
    if (msg.type !== "acpTestResult") return
    if (msg.key !== props.name) return
    setTesting(false)
    setResult({
      success: msg.success,
      error: msg.error,
      models: msg.models ?? [],
    })
  })
  onCleanup(unsub)

  const test = () => {
    setTesting(true)
    setResult(null)
    vscode.postMessage({ type: "testAcpConnection", key: props.name })
  }

  // Fingerprint the relevant config to detect changes while enabled
  const fingerprint = createMemo(() =>
    JSON.stringify({ enabled: props.cfg.enabled, model: props.cfg.model, env: props.cfg.env }),
  )

  // Auto-test when config changes while enabled (debounced by config auto-save)
  let prev: string | undefined
  createEffect(
    on(fingerprint, (current) => {
      if (!enabled()) {
        // Reset when disabled so next enable triggers a fresh test
        prev = undefined
        setResult(null)
        return
      }

      const hasModels = (props.cfg as any).discoveredModels && (props.cfg as any).discoveredModels.length > 0

      if (prev !== undefined && prev !== current) {
        // Config changed while enabled
        if (!hasModels) test()
      } else if (prev === undefined) {
        // Just enabled
        if (!hasModels) test()
      }
      prev = current
    }),
  )

  const discovered = () => result()?.models ?? props.cfg.discoveredModels ?? []

  const toggle = () => setExpanded((v) => !v)

  return (
    <div style={{ "margin-bottom": "12px" }}>
      <div
        style={{
          display: "flex",
          gap: "12px",
          "align-items": "flex-start",
          "justify-content": "space-between",
          cursor: "pointer",
        }}
        onClick={toggle}
      >
        <div style={{ display: "flex", gap: "6px", "align-items": "flex-start", flex: 1 }}>
          <IconButton
            size="small"
            variant="ghost"
            icon={expanded() ? "chevron-down" : "chevron-right"}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              toggle()
            }}
            style={{ "margin-top": "1px", "flex-shrink": 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px" }}>
              <div style={{ "font-weight": "600" }}>{props.item.name}</div>
              <Icon name={props.item.icon as never} style={{ "flex-shrink": 0 }} />
              <Show when={props.item.installed}>
                <span
                  style={{
                    "font-size": "10px",
                    padding: "1px 6px",
                    "border-radius": "4px",
                    background: "var(--vscode-terminal-ansiGreen, #388e3c)",
                    color: "var(--vscode-editor-background, #fff)",
                  }}
                >
                  Installed
                </span>
              </Show>
              <Show when={!props.item.installed}>
                <span
                  style={{
                    "font-size": "11px",
                    color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                  }}
                >
                  {language.t("settings.agentBehaviour.acpPredefined.notInstalled")}
                </span>
              </Show>
            </div>
            <div style={{ "font-size": "12px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
              {props.item.description}
            </div>
          </div>
        </div>
        <div
          style={{ display: "flex", "align-items": "center", gap: "8px", "flex-shrink": 0 }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <span style={{ "font-size": "12px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
            {enabled()
              ? language.t("settings.agentBehaviour.acpPredefined.disable")
              : language.t("settings.agentBehaviour.acpPredefined.enable")}
          </span>
          <Switch checked={enabled()} onChange={props.onToggle} />
        </div>
      </div>

      <Show when={expanded()}>
        <div style={{ display: "grid", gap: "12px", "margin-top": "14px", "margin-left": "28px" }}>
          {/* Discovered models list */}
          <Show when={discovered().length > 0}>
            <div style={{ display: "grid", gap: "4px" }}>
              <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--text-weak-base)" }}>
                Models
              </label>
              <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>
                <For each={discovered()}>
                  {(m) => (
                    <span
                      style={{
                        "font-size": "11px",
                        padding: "2px 8px",
                        "border-radius": "4px",
                        background: "var(--vscode-badge-background, #333)",
                        color: "var(--vscode-badge-foreground, #ccc)",
                      }}
                    >
                      {m.name}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Test Connection — only when enabled */}
          <Show when={enabled()}>
            <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <Button
                variant="secondary"
                size="small"
                onClick={test}
                disabled={testing()}
              >
                {testing() ? "Testing…" : (discovered().length > 0 || result()?.success) ? "Refetch Models" : "Discover Models"}
              </Button>
              <Show when={result() && !result()!.success}>
                <span
                  style={{
                    "font-size": "11px",
                    color: "var(--vscode-errorForeground, #f44336)",
                  }}
                >
                  ✗ {result()!.error ?? "Connection failed"}
                </span>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default PredefinedProviderCard

