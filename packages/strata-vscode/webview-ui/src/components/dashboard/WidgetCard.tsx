import { Component, JSX } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { Icon, IconProps } from "@stratacode/strata-ui/icon"

export interface WidgetCardProps {
  title: string
  icon: IconProps["name"]
  summary?: string
  children: JSX.Element
}

export const WidgetCard: Component<WidgetCardProps> = (props) => {
  return (
    <Card
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "8px",
        padding: "12px",
        "background-color": "var(--vscode-editor-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "4px",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <Icon name={props.icon} style={{ color: "var(--vscode-descriptionForeground)" }} />
          <span style={{ "font-weight": 600, "font-size": "13px" }}>{props.title}</span>
        </div>
        {props.summary && (
          <span
            style={{
              "font-size": "11px",
              color: "var(--vscode-descriptionForeground)",
            }}
          >
            {props.summary}
          </span>
        )}
      </div>
      <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
        {props.children}
      </div>
    </Card>
  )
}
