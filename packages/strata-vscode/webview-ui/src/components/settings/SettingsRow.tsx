import { Component, JSX } from "solid-js"

const SettingsRow: Component<{
  title: string
  description?: string
  last?: boolean
  vertical?: boolean
  children: JSX.Element
}> = (props) => (
  <div
    data-slot={props.vertical ? "settings-row-vertical" : "settings-row"}
    style={{
      "margin-bottom": props.last ? "0" : "8px",
      "padding-bottom": props.last ? "0" : "8px",
      "border-bottom": props.last ? "none" : "1px solid var(--border-weak-base)",
      ...(!props.vertical && (props.description === null || props.description === undefined)
        ? { "align-items": "center" }
        : {}),
    }}
  >
    <div data-slot={props.vertical ? "settings-row-vertical-label" : "settings-row-label"}>
      <div
        data-slot="settings-row-label-title"
        style={
          !props.vertical && (props.description === null || props.description === undefined)
            ? { "margin-bottom": "0" }
            : { "margin-bottom": "4px" }
        }
      >
        {props.title}
      </div>
      {props.description !== null && props.description !== undefined && (
        <div data-slot="settings-row-label-subtitle">{props.description}</div>
      )}
    </div>
    <div
      data-slot={props.vertical ? "settings-row-vertical-input" : "settings-row-input"}
      style={props.vertical ? { width: "100%" } : {}}
    >
      {props.children}
    </div>
  </div>
)

export default SettingsRow
