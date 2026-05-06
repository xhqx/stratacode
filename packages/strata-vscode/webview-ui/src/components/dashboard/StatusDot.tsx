import { Component } from "solid-js"

export type DotStatus = "connected" | "failed" | "disabled" | "pending" | "unknown"

export interface StatusDotProps {
  status: DotStatus
}

export const StatusDot: Component<StatusDotProps> = (props) => {
  const color = () => {
    switch (props.status) {
      case "connected":
        return "var(--vscode-testing-iconPassed, #4caf50)"
      case "failed":
        return "var(--vscode-errorForeground, #f44)"
      case "disabled":
        return "var(--vscode-descriptionForeground, #717171)"
      case "pending":
        return "var(--vscode-editorWarning-foreground, #cca700)"
      default:
        return "var(--vscode-descriptionForeground, #717171)"
    }
  }

  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        "border-radius": "50%",
        "background-color": color(),
        "flex-shrink": 0,
      }}
    />
  )
}
