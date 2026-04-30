import { Show, createSignal, createMemo, For } from "solid-js"
import { Collapsible } from "@stratacode/strata-ui/collapsible"
import { Icon } from "@stratacode/strata-ui/icon"
import { Tag } from "@stratacode/strata-ui/tag"
import { useKanban } from "../../context/kanban"
import { useLanguage } from "../../context/language"
import type { KanbanColumn } from "../../types/messages/kanban"
import { TaskBoardCard } from "./TaskBoardCard"

interface Props {
  column: KanbanColumn
}

export function TaskBoardSection(props: Props) {
  const kanban = useKanban()
  const language = useLanguage()
  const [open, setOpen] = createSignal(true)
  const [isDragOver, setIsDragOver] = createSignal(false)

  const tasks = createMemo(() => {
    return kanban.tasks().filter((t) => t.column === props.column)
  })

  const columnLabel = () => {
    switch (props.column) {
      case "planned":
        return language.t("kanban.columns.planned")
      case "todo":
        return language.t("kanban.columns.todo")
      case "progress":
        return language.t("kanban.columns.progress")
      case "needs_action":
        return language.t("kanban.columns.needsAction")
      case "done":
        return language.t("kanban.columns.done")
    }
  }

  const columnIcon = () => {
    switch (props.column) {
      case "planned":
        return "clock" as any
      case "todo":
        return "dash" as any
      case "progress":
        return "glasses" as any
      case "needs_action":
        return "warning" as any
      case "done":
        return "circle-check" as any
    }
  }

  const handleDragOver = (e: DragEvent) => {
    if (props.column === "planned") return // Cannot drop into planned
    if (e.dataTransfer?.types.includes("application/x-strata-task")) {
      e.preventDefault() // Allow drop
      e.dataTransfer.dropEffect = "move"
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: DragEvent) => {
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    setIsDragOver(false)
    const taskId = e.dataTransfer?.getData("application/x-strata-task")
    if (taskId) {
      kanban.moveTask(taskId, props.column)
    }
  }

  return (
    <Collapsible open={open()} onOpenChange={setOpen} variant="ghost" class="task-board-section">
      <Collapsible.Trigger>
        <div data-slot="task-board-section-header">
          <Icon name={columnIcon() as any} size="small" />
          <span>{columnLabel()}</span>
          <Tag>{tasks().length}</Tag>
          <Collapsible.Arrow />
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div
          data-slot="task-board-section-cards"
          data-drag-over={isDragOver() ? "" : undefined}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <For each={tasks()}>{(task) => <TaskBoardCard task={task} />}</For>
          <Show when={tasks().length === 0}>
            <div data-slot="task-board-empty">{language.t("kanban.empty")}</div>
          </Show>
        </div>
      </Collapsible.Content>
    </Collapsible>
  )
}
