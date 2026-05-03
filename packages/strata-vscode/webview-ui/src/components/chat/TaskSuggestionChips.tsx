// stratacode_change - new file
import { Component, For, Show } from "solid-js"

interface Props {
  suggestions: () => string[]
  loading: () => boolean
  enabled: () => boolean
  /** Called when the user clicks a chip to fill the prompt input. */
  onSelect: (text: string) => void
}

/**
 * Renders clickable task suggestion chips below the chat input area.
 * Only visible when the prompt input is empty and suggestions are available.
 */
const TaskSuggestionChips: Component<Props> = (props) => {
  return (
    <Show when={props.enabled()}>
      <div
        class="task-suggestion-chips"
        style={{
          display: "flex",
          "flex-wrap": "wrap",
          gap: "6px",
          padding: "6px 0 2px",
        }}
      >
        <Show
          when={!props.loading()}
          fallback={
            <span
              style={{
                "font-size": "11px",
                color: "var(--vscode-descriptionForeground)",
                opacity: "0.7",
                padding: "2px 0",
              }}
            >
              Thinking…
            </span>
          }
        >
          <For each={props.suggestions()}>
            {(suggestion) => (
              <button
                type="button"
                title={suggestion}
                onClick={() => props.onSelect(suggestion)}
                style={{
                  "font-size": "11px",
                  padding: "3px 10px",
                  "border-radius": "12px",
                  border: "1px solid var(--vscode-panel-border, rgba(255,255,255,0.12))",
                  background: "var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05))",
                  color: "var(--vscode-foreground)",
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                  "white-space": "nowrap",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "max-width": "260px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--vscode-list-hoverBackground, rgba(255,255,255,0.1))"
                  e.currentTarget.style.borderColor = "var(--vscode-focusBorder, #007acc)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05))"
                  e.currentTarget.style.borderColor = "var(--vscode-panel-border, rgba(255,255,255,0.12))"
                }}
              >
                {suggestion}
              </button>
            )}
          </For>
        </Show>
      </div>
    </Show>
  )
}

export default TaskSuggestionChips
