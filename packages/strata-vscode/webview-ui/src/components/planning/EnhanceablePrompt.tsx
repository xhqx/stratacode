import { Show } from "solid-js"
import MarkdownEditor from "../settings/MarkdownEditor"
import { Button } from "@stratacode/strata-ui/button"
import { Tooltip } from "@stratacode/strata-ui/tooltip"
import { WandSparkles } from "@stratacode/strata-ui/lucide"
import type { Accessor } from "solid-js"

interface Props {
  label: string
  tooltip: string
  busy: string
  prompt: Accessor<string>
  enhancing: Accessor<boolean>
  onInput: (value: string) => void
  onEnhance: () => void
  onUndo: () => string | null
}

export function EnhanceablePrompt(props: Props) {
  return (
    <div>
      <div style={{ display: "flex", "align-items": "center", gap: "4px", "margin-bottom": "4px" }}>
        <label style={{ "font-size": "0.9em", "font-weight": 600 }}>{props.label}</label>
        <Tooltip value={props.tooltip} placement="top">
          <Button
            variant="ghost"
            size="small"
            onClick={props.onEnhance}
            disabled={!props.prompt().trim() || props.enhancing()}
            aria-label={props.tooltip}
          >
            <WandSparkles size={14} class={props.enhancing() ? "enhance-spinner" : ""} />
          </Button>
        </Tooltip>
        <Show when={props.enhancing()}>
          <span style={{ "font-size": "0.8em", opacity: 0.7 }}>{props.busy}</span>
        </Show>
      </div>
      <div
        onKeyDown={(e) => {
          if (!((e.metaKey || e.ctrlKey) && e.key === "z")) return
          const prev = props.onUndo()
          if (prev === null) return
          e.preventDefault()
          props.onInput(prev)
        }}
      >
        <MarkdownEditor
          value={props.prompt()}
          placeholder="Instructions for the agent..."
          minHeight="80px"
          onChange={(val) => props.onInput(val)}
        />
      </div>
    </div>
  )
}
