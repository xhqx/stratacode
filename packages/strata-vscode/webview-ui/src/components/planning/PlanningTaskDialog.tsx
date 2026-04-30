import { createSignal, Show, For } from "solid-js"
import { Button } from "@stratacode/strata-ui/button"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { useLanguage } from "../../context/language"
import { usePlanning } from "../../context/planning"
import type { PlanningTask } from "../../types/messages/planning"

interface Props {
  task?: PlanningTask
  onClose: () => void
  onSave: (updates: any) => void
}

export function PlanningTaskDialog(props: Props) {
  const language = useLanguage()
  const planning = usePlanning()

  const isEdit = !!props.task
  const [title, setTitle] = createSignal(props.task?.title ?? "")
  const [description, setDescription] = createSignal(props.task?.description ?? "")
  const [prompt, setPrompt] = createSignal(props.task?.prompt ?? "")
  const [startAt, setStartAt] = createSignal(
    props.task?.startAt ? new Date(props.task.startAt).toISOString().slice(0, 16) : "",
  )
  const [duration, setDuration] = createSignal(props.task?.duration?.toString() ?? "")
  const [priority, setPriority] = createSignal(props.task?.priority?.toString() ?? "3")
  const [dependsOn, setDependsOn] = createSignal<string[]>(props.task?.dependsOn ?? [])

  const availableTasks = () => planning.tasks().filter((t) => t.id !== props.task?.id)

  const handleSave = () => {
    if (!title().trim() || !prompt().trim()) return

    if (isEdit && planning.hasCycle(props.task!.id, dependsOn())) {
      alert(language.t("planning.cycleDetected"))
      return
    }

    props.onSave({
      title: title().trim(),
      description: description().trim() || undefined,
      prompt: prompt().trim(),
      startAt: startAt() ? new Date(startAt()).toISOString() : undefined,
      duration: duration() ? parseInt(duration(), 10) : undefined,
      priority: parseInt(priority(), 10),
      dependsOn: dependsOn().length > 0 ? dependsOn() : undefined,
    })
  }

  const toggleDep = (id: string) => {
    setDependsOn((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  return (
    <Dialog title={isEdit ? language.t("planning.editTask") : language.t("planning.addTask")} fit>
      <div style={{ "max-width": "500px", "max-height": "90vh", "overflow-y": "auto", padding: "16px" }}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px", padding: "16px 0" }}>
          <div>
            <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
              Title *
            </label>
            <TextField
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="E.g. Setup Database"
              autofocus
            />
          </div>

          <div>
            <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
              Prompt *
            </label>
            <textarea
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              placeholder="Instructions for the agent..."
              style={{
                width: "100%",
                "min-height": "80px",
                background: "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                border: "1px solid var(--vscode-input-border)",
                padding: "4px",
              }}
            />
          </div>

          <div>
            <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
              Description
            </label>
            <TextField value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
                {language.t("planning.startAt")}
              </label>
              <input
                type="datetime-local"
                value={startAt()}
                onInput={(e) => setStartAt(e.currentTarget.value)}
                style={{
                  width: "100%",
                  background: "var(--vscode-input-background)",
                  color: "var(--vscode-input-foreground)",
                  border: "1px solid var(--vscode-input-border)",
                  padding: "4px",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
                {language.t("planning.duration")}
              </label>
              <TextField
                type="number"
                value={duration()}
                onInput={(e) => setDuration(e.currentTarget.value)}
                placeholder="minutes"
              />
            </div>
          </div>

          <div>
            <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
              {language.t("planning.priority")}
            </label>
            <select
              value={priority()}
              onChange={(e) => setPriority(e.currentTarget.value)}
              style={{
                width: "100%",
                background: "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                border: "1px solid var(--vscode-input-border)",
                padding: "4px",
              }}
            >
              <option value="1">1 - {language.t("planning.priority.1")}</option>
              <option value="2">2 - {language.t("planning.priority.2")}</option>
              <option value="3">3 - {language.t("planning.priority.3")}</option>
              <option value="4">4 - {language.t("planning.priority.4")}</option>
              <option value="5">5 - {language.t("planning.priority.5")}</option>
            </select>
          </div>

          <Show when={availableTasks().length > 0}>
            <div>
              <label style={{ "font-size": "0.9em", "font-weight": 600, display: "block", "margin-bottom": "4px" }}>
                {language.t("planning.dependsOn")}
              </label>
              <div
                style={{
                  "max-height": "100px",
                  "overflow-y": "auto",
                  border: "1px solid var(--vscode-input-border)",
                  padding: "4px",
                }}
              >
                <For each={availableTasks()}>
                  {(task) => (
                    <label style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px" }}>
                      <input
                        type="checkbox"
                        checked={dependsOn().includes(task.id)}
                        onChange={() => toggleDep(task.id)}
                      />
                      <span>{task.title}</span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "16px" }}>
          <Button variant="secondary" onClick={props.onClose}>
            {language.t("kanban.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!title().trim() || !prompt().trim()}>
            {language.t("common.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
