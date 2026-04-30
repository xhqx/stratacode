import { For, Show, createSignal } from "solid-js"
import { usePlanning } from "../../context/planning"
import { useLanguage } from "../../context/language"
import { Card } from "@stratacode/strata-ui/card"
import { Tag } from "@stratacode/strata-ui/tag"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Icon } from "@stratacode/strata-ui/icon"
import { PlanningTaskDialog } from "./PlanningTaskDialog"
import type { PlanningTask } from "../../types/messages/planning"

export function PlanningList() {
  const planning = usePlanning()
  const language = useLanguage()
  const [editingTask, setEditingTask] = createSignal<PlanningTask | null>(null)

  const priorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return "var(--vscode-charts-red)"
      case 2:
        return "var(--vscode-charts-orange)"
      case 3:
        return "var(--vscode-charts-yellow)"
      case 4:
        return "var(--vscode-charts-blue)"
      case 5:
        return "var(--vscode-charts-green)"
      default:
        return "var(--vscode-foreground)"
    }
  }

  const priorityLabel = (priority: number) => {
    return language.t(`planning.priority.${priority}` as any)
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "var(--vscode-foreground)"
      case "ready":
        return "var(--vscode-charts-blue)"
      case "dispatched":
        return "var(--vscode-charts-orange)"
      case "needs_review":
        return "var(--vscode-charts-purple)"
      case "done":
        return "var(--vscode-charts-green)"
      case "failed":
        return "var(--vscode-charts-red)"
      default:
        return "var(--vscode-foreground)"
    }
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
      <Show when={planning.tasks().length === 0}>
        <div style={{ padding: "16px", "text-align": "center", opacity: 0.7 }}>{language.t("planning.noTasks")}</div>
      </Show>

      <For each={planning.tasks()}>
        {(task) => (
          <Card style={{ padding: "12px", display: "flex", "flex-direction": "column", gap: "8px" }}>
            <div style={{ display: "flex", "justify-content": "space-between", "align-items": "flex-start" }}>
              <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                <Icon name={"clock" as any} style={{ color: statusColor(task.status) }} />
                <span style={{ "font-weight": 600 }}>{task.title}</span>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <Show when={task.status === "planned" || task.status === "ready"}>
                  <IconButton icon="edit" size="small" variant="ghost" onClick={() => setEditingTask(task)} />
                  <IconButton
                    icon="play"
                    size="small"
                    variant="ghost"
                    onClick={() => planning.dispatch(task.id)}
                    title={language.t("planning.dispatch")}
                  />
                </Show>
                <Show when={task.status === "needs_review"}>
                  <IconButton
                    icon="check"
                    size="small"
                    variant="ghost"
                    onClick={() => planning.confirm(task.id)}
                    title={language.t("planning.confirm")}
                  />
                </Show>
                <Show when={task.status === "failed"}>
                  <IconButton
                    icon={"refresh" as any}
                    size="small"
                    variant="ghost"
                    onClick={() => planning.dispatch(task.id)}
                    title={language.t("planning.retry")}
                  />
                </Show>
                <IconButton icon="trash" size="small" variant="ghost" onClick={() => planning.remove(task.id)} />
              </div>
            </div>

            <Show when={task.description}>
              <div style={{ opacity: 0.8, "font-size": "0.9em" }}>{task.description}</div>
            </Show>

            <div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap" }}>
              <Tag style={{ color: priorityColor(task.priority), "border-color": priorityColor(task.priority) }}>
                {priorityLabel(task.priority)}
              </Tag>
              <Tag style={{ color: statusColor(task.status) }}>
                {language.t(`planning.status.${task.status}` as any) || task.status}
              </Tag>
              <Show when={task.startAt}>
                <Tag>
                  <Icon name={"calendar" as any} size="small" /> {new Date(task.startAt!).toLocaleString()}
                </Tag>
              </Show>
              <Show when={task.duration}>
                <Tag>
                  <Icon name={"watch" as any} size="small" /> {task.duration}m
                </Tag>
              </Show>
              <Show when={task.dependsOn && task.dependsOn.length > 0}>
                <Tag>
                  <Icon name="link" size="small" /> {task.dependsOn?.length} deps
                </Tag>
              </Show>
            </div>
          </Card>
        )}
      </For>

      <Show when={editingTask()}>
        <PlanningTaskDialog
          task={editingTask()!}
          onClose={() => setEditingTask(null)}
          onSave={(updates) => {
            planning.update(editingTask()!.id, updates)
            setEditingTask(null)
          }}
        />
      </Show>
    </div>
  )
}
