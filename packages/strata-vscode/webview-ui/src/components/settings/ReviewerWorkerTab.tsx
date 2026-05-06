import { Component, createSignal, onCleanup } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { useVSCode } from "../../context/vscode"
import type { ExtensionMessage } from "../../types/messages"
import SettingsRow from "./SettingsRow"

const ReviewerWorkerTab: Component = () => {
  const vscode = useVSCode()

  const [reviewPrompt, setReviewPrompt] = createSignal("")

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "settingLoaded") return
    if (message.key === "workers.reviewPrompt") setReviewPrompt(message.value as string)
  })
  onCleanup(unsubscribe)

  vscode.postMessage({ type: "requestSetting", key: "workers.reviewPrompt" })

  const save = (key: string, value: unknown) => {
    vscode.postMessage({ type: "updateSetting", key, value })
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      <div
        style={{
          background: "var(--vscode-textBlockQuote-background)",
          border: "1px solid var(--vscode-panel-border)",
          "border-radius": "4px",
          padding: "12px 16px",
        }}
      >
        <p
          style={{
            "font-size": "12px",
            color: "var(--vscode-descriptionForeground)",
            margin: 0,
            "line-height": "1.5",
          }}
        >
          The reviewer worker automatically reviews code changes, tests, and best practices as you work.
        </p>
      </div>

      <Card>
        <SettingsRow
          title="Reviewer Prompt"
          description="Custom system prompt for the reviewer worker. Leave empty for default."
          last
        >
          <textarea
            value={reviewPrompt()}
            onInput={(e) => {
              const val = e.currentTarget.value
              setReviewPrompt(val)
              save("workers.reviewPrompt", val)
            }}
            placeholder="Enter custom prompt here..."
            style={{
              width: "100%",
              "min-height": "80px",
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-input-border)",
              padding: "8px",
              "border-radius": "2px",
              "font-family": "var(--vscode-font-family)",
              resize: "vertical",
            }}
          />
        </SettingsRow>
      </Card>
    </div>
  )
}

export default ReviewerWorkerTab
