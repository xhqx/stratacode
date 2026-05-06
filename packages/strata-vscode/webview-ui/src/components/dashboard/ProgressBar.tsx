import { Component } from "solid-js"

export interface ProgressBarProps {
  current: number
  max: number
  label?: string
  warn?: number // percentage threshold for yellow (0-100)
  danger?: number // percentage threshold for red (0-100)
}

export const ProgressBar: Component<ProgressBarProps> = (props) => {
  const percentage = () => {
    if (props.max === 0) return 0
    return Math.min(100, Math.max(0, (props.current / props.max) * 100))
  }

  const color = () => {
    const p = percentage()
    if (props.danger !== undefined && p >= props.danger) {
      return "var(--vscode-errorForeground, #f44)"
    }
    if (props.warn !== undefined && p >= props.warn) {
      return "var(--vscode-editorWarning-foreground, #cca700)"
    }
    return "var(--vscode-testing-iconPassed, #4caf50)"
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "4px", width: "100%" }}>
      {props.label && (
        <div style={{ "font-size": "11px", color: "var(--vscode-descriptionForeground)" }}>
          {props.label}
        </div>
      )}
      <div
        style={{
          width: "100%",
          height: "4px",
          "background-color": "var(--vscode-editorWidget-background)",
          border: "1px solid var(--vscode-widget-border)",
          "border-radius": "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentage()}%`,
            "background-color": color(),
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  )
}
