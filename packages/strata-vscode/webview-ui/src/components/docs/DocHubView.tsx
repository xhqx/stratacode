// stratacode_change - new file
import { Show, createSignal, onMount } from "solid-js"
import { Button } from "@stratacode/strata-ui/button"
import { Icon } from "@stratacode/strata-ui/icon"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { useDocs } from "../../context/docs"
import { useLanguage } from "../../context/language"
import { DocSidebar } from "./DocSidebar"
import { DocPageView } from "./DocPageView"

interface Props {
  onBack?: () => void
}

export function DocHubView(props: Props) {
  const docs = useDocs()
  const language = useLanguage()
  const [selectedPageId, setSelectedPageId] = createSignal<string | null>(null)

  onMount(() => {
    docs.requestManifest()
  })

  return (
    <div data-component="doc-hub" style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div
        data-slot="doc-hub-header"
        class="history-view-header"
        style={{
          display: "flex",
          "align-items": "center",
          padding: "8px",
          "border-bottom": "1px solid var(--vscode-panel-border)",
        }}
      >
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => props.onBack?.()}>
          {language.t("docs.back")}
        </Button>
        <span
          data-slot="doc-hub-title"
          style={{
            flex: 1,
            display: "flex",
            "align-items": "center",
            gap: "6px",
            "font-weight": 600,
            "margin-left": "8px",
          }}
        >
          <Icon name="book" size="small" />
          {language.t("docs.title")}
        </span>
        <Show when={docs.isGenerating()}>
          <span style={{ "font-size": "12px", color: "var(--vscode-descriptionForeground)", "margin-right": "8px" }}>
            {language.t("docs.generating")}
          </span>
        </Show>
        <IconButton
          icon="reset"
          size="small"
          variant="ghost"
          onClick={() => docs.generateAll()}
          disabled={docs.isGenerating()}
          title={language.t("docs.generateAll")}
        />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", "flex-direction": "column" }}>
        <Show when={!selectedPageId()}>
          <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
            <DocSidebar onSelectPage={setSelectedPageId} />
          </div>
        </Show>
        <Show when={selectedPageId()}>
          <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
            <div style={{ "margin-bottom": "8px" }}>
              <Button variant="ghost" size="small" onClick={() => setSelectedPageId(null)}>
                {language.t("docs.backToIndex")}
              </Button>
            </div>
            <DocPageView pageId={selectedPageId()!} />
          </div>
        </Show>
      </div>
    </div>
  )
}
