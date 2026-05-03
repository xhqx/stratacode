import { Show, createSignal, For, onMount } from "solid-js"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Tooltip } from "@stratacode/strata-ui/tooltip"
import { useKanban } from "../../context/kanban"
import { useLanguage } from "../../context/language"
import { usePlanning } from "../../context/planning"
import { KANBAN_COLUMNS } from "../../types/messages/kanban"
import { TaskBoardSection } from "./TaskBoardSection"
import { TaskBoardColumn } from "./TaskBoardColumn"

interface Props {
  onBack?: () => void
}

export function TaskBoardView(props: Props) {
  const kanban = useKanban()
  const language = useLanguage()
  const planning = usePlanning()

  const [adding, setAdding] = createSignal(false)
  const [newTaskTitle, setNewTaskTitle] = createSignal("")
  const [newTaskDesc, setNewTaskDesc] = createSignal("")

  onMount(() => {
    planning.requestMarkdownPreview()
  })

  const pending = () => planning.markdownPreview()?.pending ?? 0

  const handleAdd = () => {
    if (!newTaskTitle().trim()) return
    kanban.addTask(newTaskTitle().trim(), newTaskDesc().trim() || undefined)
    setNewTaskTitle("")
    setNewTaskDesc("")
    setAdding(false)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleAdd()
    } else if (e.key === "Escape") {
      setAdding(false)
    }
  }

  const toggleLayout = () => {
    kanban.setLayout(kanban.layout() === "vertical" ? "horizontal" : "vertical")
  }

  return (
    <div data-component="task-board" data-layout={kanban.layout()}>
      <div data-slot="task-board-header" class="history-view-header">
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => props.onBack?.()}>
          {language.t("kanban.back")}
        </Button>
        <span data-slot="task-board-title" style={{ flex: 1, "font-weight": 600 }}>
          {language.t("kanban.title")}
        </span>
        <Tooltip
          value={
            kanban.layout() === "vertical"
              ? language.t("kanban.layout.horizontal")
              : language.t("kanban.layout.vertical")
          }
        >
          <IconButton
            icon={kanban.layout() === "vertical" ? "layout-right" : "bullet-list"}
            size="small"
            variant="ghost"
            onClick={toggleLayout}
          />
        </Tooltip>
        <Tooltip value={language.t("kanban.addTask")}>
          <IconButton icon="plus" size="small" variant="ghost" onClick={() => setAdding(!adding())} />
        </Tooltip>
        <Show when={pending() > 0}>
          <Tooltip value={language.t("planning.applyMarkdown.tooltip")}>
            <Button
              size="small"
              variant="ghost"
              icon={"file-symlink-file" as any}
              onClick={() => planning.applyMarkdown()}
            >
              {language.t("planning.applyMarkdown")} ({pending()})
            </Button>
          </Tooltip>
        </Show>
      </div>

      <Show when={adding()}>
        <div data-slot="task-board-add-form">
          <TextField
            value={newTaskTitle()}
            onInput={setNewTaskTitle}
            placeholder={language.t("kanban.placeholder.title")}
            onKeyDown={handleKeyDown}
            autofocus
          />
          <TextField
            value={newTaskDesc()}
            onInput={setNewTaskDesc}
            placeholder={language.t("kanban.placeholder.description")}
            onKeyDown={handleKeyDown}
          />
          <div data-slot="task-board-add-actions">
            <Button size="small" variant="primary" onClick={handleAdd} disabled={!newTaskTitle().trim()}>
              {language.t("kanban.addTask")}
            </Button>
            <Button size="small" variant="ghost" onClick={() => setAdding(false)}>
              {language.t("kanban.cancel")}
            </Button>
          </div>
        </div>
      </Show>

      <div data-slot="task-board-content">
        <Show
          when={kanban.layout() === "vertical"}
          fallback={
            <div data-slot="task-board-horizontal-container">
              <For each={KANBAN_COLUMNS}>{(col) => <TaskBoardColumn column={col} />}</For>
            </div>
          }
        >
          <div data-slot="task-board-vertical-container">
            <For each={KANBAN_COLUMNS}>{(col) => <TaskBoardSection column={col} />}</For>
          </div>
        </Show>
      </div>
    </div>
  )
}
