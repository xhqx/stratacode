import { Show, For } from "solid-js"
import type { Accessor } from "solid-js"
import type { PlanningTask } from "../../types/messages/planning"

interface Props {
  label: string
  availableTasks: PlanningTask[]
  dependsOn: Accessor<string[]>
  onToggle: (id: string) => void
}

export function DependencySelector(props: Props) {
  return (
    <Show when={props.availableTasks.length > 0}>
      <div>
        <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
          {props.label}
        </label>
        <div
          style={{
            "max-height": "100px",
            "overflow-y": "auto",
            border: "1px solid var(--vscode-input-border)",
            padding: "4px",
          }}
        >
          <For each={props.availableTasks}>
            {(task) => (
              <label style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px" }}>
                <input
                  type="checkbox"
                  checked={props.dependsOn().includes(task.id)}
                  onChange={() => props.onToggle(task.id)}
                />
                <span>{task.title}</span>
              </label>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
