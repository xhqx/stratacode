import { Show, createSignal, createMemo, onCleanup, onMount } from "solid-js"
import { Card } from "@stratacode/strata-ui/card"
import { ContextMenu } from "@stratacode/strata-ui/context-menu"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Icon } from "@stratacode/strata-ui/icon"
import { Tag } from "@stratacode/strata-ui/tag"
import { useKanban } from "../../context/kanban"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { useSession } from "../../context/session"
import { KANBAN_COLUMNS, type KanbanColumn, type KanbanTask } from "../../types/messages/kanban"

interface Props {
  task: KanbanTask
}

export function TaskBoardCard(props: Props) {
  const kanban = useKanban()
  const language = useLanguage()
  const vscode = useVSCode()
  const session = useSession()

  const isManual = () => props.task.source === "manual"
  const isPlanned = () => props.task.source === "planned"

  const otherColumns = createMemo(() => {
    return KANBAN_COLUMNS.filter((c) => c !== props.task.column)
  })

  const columnLabel = (col: KanbanColumn) => {
    switch (col) {
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

  const handleDelete = () => {
    if (isManual()) kanban.deleteTask(props.task.id)
  }

  const handleMove = (col: KanbanColumn) => {
    kanban.moveTask(props.task.id, col)
  }

  const jumpToSession = () => {
    if (props.task.sessionID) {
      session.selectSession(props.task.sessionID)
    }
  }

  const sessionTitle = createMemo(() => {
    if (!props.task.sessionID) return ""
    const info = session.sessions().find((s) => s.id === props.task.sessionID)
    return info?.title || "Session"
  })

  // Drag and Drop
  const handleDragStart = (e: DragEvent) => {
    if (!isManual()) {
      e.preventDefault()
      return
    }
    if (e.dataTransfer) {
      e.dataTransfer.setData("application/x-strata-task", props.task.id)
      e.dataTransfer.effectAllowed = "move"
    }
  }

  const handleClick = () => {
    if (isPlanned()) {
      vscode.postMessage({ type: "planningButtonClicked" } as any)
    }
  }

  return (
    <Card
      data-component="task-board-card"
      data-source={props.task.source}
      draggable={isManual()}
      onDragStart={handleDragStart}
      onClick={handleClick}
    >
      <div data-slot="task-board-card-header">
        <Icon name={(isPlanned() ? "clock" : isManual() ? "pencil-line" : "brain") as any} size="small" />
        <span data-slot="task-board-card-title" title={props.task.title}>
          {props.task.title}
        </span>
        <Show when={isManual()}>
          <ContextMenu>
            <ContextMenu.Trigger>
              <IconButton icon="menu" size="small" variant="ghost" />
            </ContextMenu.Trigger>
            <ContextMenu.Content>
              {otherColumns().map((col) => (
                <ContextMenu.Item onSelect={() => handleMove(col)}>
                  {language.t("kanban.moveTo")} {columnLabel(col)}
                </ContextMenu.Item>
              ))}
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={handleDelete}>
                {language.t("kanban.delete")}
              </ContextMenu.Item>
              <Show when={props.task.sessionID}>
                <ContextMenu.Separator />
                <ContextMenu.Item onSelect={jumpToSession}>
                  {language.t("kanban.goToSession")}
                </ContextMenu.Item>
              </Show>
            </ContextMenu.Content>
          </ContextMenu>
        </Show>
        <Show when={!isManual() && props.task.sessionID && props.task.sessionID !== session.currentSessionID()}>
           <IconButton icon="arrow-right" size="small" variant="ghost" onClick={jumpToSession} title={language.t("kanban.goToSession")} />
        </Show>
      </div>

      <Show when={props.task.description}>
        <div data-slot="task-board-card-description">{props.task.description}</div>
      </Show>

      <Show when={props.task.sessionID}>
        <div data-slot="task-board-card-footer">
          <Tag data-slot="task-board-card-session" onClick={jumpToSession}>
            <Icon name="speech-bubble" size="small" />
            {sessionTitle()}
          </Tag>
        </div>
      </Show>
    </Card>
  )
}
