import { createSignal, Show, Switch, Match, onMount } from "solid-js"
import { Button } from "@stratacode/strata-ui/button"
import { useLanguage } from "../../context/language"
import { usePlanning } from "../../context/planning"
import { PlanningList } from "./PlanningList"
import { PlanningTimeline } from "./PlanningTimeline"
import { PlanningGraph } from "./PlanningGraph"
import { PlanningTaskDialog } from "./PlanningTaskDialog"

interface Props {
  onBack?: () => void
}

type ViewMode = "list" | "timeline" | "graph"

export function PlanningView(props: Props) {
  const language = useLanguage()
  const planning = usePlanning()
  const [viewMode, setViewMode] = createSignal<ViewMode>("list")
  const [isAdding, setIsAdding] = createSignal(false)

  onMount(() => {
    planning.requestMarkdownPreview()
  })

  const pending = () => planning.markdownPreview()?.pending ?? 0

  return (
    <div data-component="planning-view" style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div
        data-slot="planning-header"
        class="history-view-header"
        style={{ padding: "8px", "border-bottom": "1px solid var(--vscode-panel-border)" }}
      >
        <div style={{ display: "flex", "align-items": "center", "margin-bottom": "8px" }}>
          <Button variant="ghost" size="small" icon="arrow-left" onClick={() => props.onBack?.()}>
            {language.t("planning.back")}
          </Button>
          <span style={{ flex: 1, "font-weight": 600, "margin-left": "8px" }}>{language.t("planning.title")}</span>
          <Button
            size="small"
            icon={"file-text" as any}
            variant="ghost"
            onClick={() => planning.openPlanFile(".strata/plans/index.md")}
            title={language.t("planning.openPlanFile")}
          >
            {language.t("planning.openPlanFile")}
          </Button>
          <Show when={pending() > 0}>
            <Button
              size="small"
              icon={"file-symlink-file" as any}
              onClick={() => planning.applyMarkdown()}
              title={language.t("planning.applyMarkdown.tooltip")}
            >
              {language.t("planning.applyMarkdown")} ({pending()})
            </Button>
          </Show>
          <Button size="small" icon={"add" as any} onClick={() => setIsAdding(true)}>
            {language.t("planning.addTask")}
          </Button>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant={viewMode() === "list" ? "primary" : "secondary"}
            size="small"
            icon={"list-flat" as any}
            onClick={() => setViewMode("list")}
          >
            {language.t("planning.list")}
          </Button>
          <Button
            variant={viewMode() === "timeline" ? "primary" : "secondary"}
            size="small"
            icon={"watch" as any}
            onClick={() => setViewMode("timeline")}
          >
            {language.t("planning.timeline")}
          </Button>
          <Button
            variant={viewMode() === "graph" ? "primary" : "secondary"}
            size="small"
            icon={"organization" as any}
            onClick={() => setViewMode("graph")}
          >
            {language.t("planning.dependencies")}
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, "overflow-y": "auto", padding: "8px" }}>
        <Switch>
          <Match when={viewMode() === "list"}>
            <PlanningList />
          </Match>
          <Match when={viewMode() === "timeline"}>
            <PlanningTimeline />
          </Match>
          <Match when={viewMode() === "graph"}>
            <PlanningGraph />
          </Match>
        </Switch>
      </div>

      <Show when={isAdding()}>
        <PlanningTaskDialog
          onClose={() => setIsAdding(false)}
          onSave={(taskOpts) => {
            planning.add(taskOpts)
            setIsAdding(false)
          }}
        />
      </Show>
    </div>
  )
}
