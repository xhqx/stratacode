import { Icon } from "@stratacode/strata-ui/icon"
import { Select } from "@stratacode/strata-ui/select"
import { Switch } from "@stratacode/strata-ui/switch"
import { Button } from "@stratacode/strata-ui/button"
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
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
    staticModels: { id: string; name: string; description?: string }[]
    liveModels: { id: string; name: string; description?: string }[]
    env: string[]
    installed: boolean
  }
  cfg: AcpProviderConfig
  onToggle: (value: boolean) => void
  onModel: (value: string) => void
  onEnv: (key: string, value: string) => void
}

const PredefinedProviderCard = (props: Props) => {
  const language = useLanguage()
  const vscode = useVSCode()

  const enabled = () => props.cfg.enabled === true
  const model = () => props.cfg.model ?? props.item.defaultModel
  const models = () => props.item.liveModels?.length ? props.item.liveModels : props.item.staticModels

  const [testing, setTesting] = createSignal(false)
  const [result, setResult] = createSignal<{ success: boolean; error?: string; count?: number } | null>(null)

  const unsub = vscode.onMessage((msg: ExtensionMessage) => {
    if (msg.type !== "acpTestResult") return
    if (msg.key !== props.name) return
    setTesting(false)
    setResult({
      success: msg.success,
      error: msg.error,
      count: msg.models?.length ?? 0,
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
      if (prev !== undefined && prev !== current) {
        // Config changed while enabled — re-test
        test()
      } else if (prev === undefined) {
        // Just enabled — auto-test
        test()
      }
      prev = current
    }),
  )

  return (
    <div style={{ "margin-bottom": "12px" }}>
      <div style={{ display: "flex", gap: "12px", "align-items": "flex-start", "justify-content": "space-between" }}>
        <div style={{ display: "flex", gap: "10px", flex: 1 }}>
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
        <div style={{ display: "flex", "align-items": "center", gap: "8px", "flex-shrink": 0 }}>
          <span style={{ "font-size": "12px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
            {enabled()
              ? language.t("settings.agentBehaviour.acpPredefined.disable")
              : language.t("settings.agentBehaviour.acpPredefined.enable")}
          </span>
          <Switch checked={enabled()} onChange={props.onToggle} />
        </div>
      </div>

      <Show when={enabled()}>
        <div style={{ display: "grid", gap: "12px", "margin-top": "14px", "margin-left": "16px" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <label style={{ "font-size": "12px", "font-weight": "500", color: "var(--text-weak-base)" }}>
              {language.t("settings.agentBehaviour.acpPredefined.model")}
            </label>
            <Select
              options={models()}
              current={models().find((item) => item.id === model())}
              value={(item) => item.id}
              label={(item) => item.name}
              onSelect={(item) => item && props.onModel(item.id)}
              variant="secondary"
              size="small"
              triggerVariant="settings"
            />
          </div>

          {/* Test Connection */}
          <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
            <Button
              variant="secondary"
              size="small"
              onClick={test}
              disabled={testing() || result()?.success === true}
            >
              {testing() ? "Testing…" : result()?.success ? "Connected!" : "Test Connection"}
            </Button>
            <Show when={result()}>
              {(res) => (
                <span
                  style={{
                    "font-size": "11px",
                    color: res().success
                      ? "var(--vscode-terminal-ansiGreen, #388e3c)"
                      : "var(--vscode-errorForeground, #f44336)",
                  }}
                >
                  {res().success
                    ? `✓ Connected — ${res().count} model${res().count !== 1 ? "s" : ""} found`
                    : `✗ ${res().error ?? "Connection failed"}`}
                </span>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default PredefinedProviderCard
