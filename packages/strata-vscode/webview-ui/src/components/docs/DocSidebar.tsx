import { For, Show } from "solid-js"
import { Button } from "@stratacode/strata-ui/button"
import { Icon } from "@stratacode/strata-ui/icon"
import { useDocs } from "../../context/docs"
import { useLanguage } from "../../context/language"
import { DocSkeleton } from "./DocSkeleton"

interface Props {
  onSelectPage: (id: string) => void
}

export function DocSidebar(props: Props) {
  const docs = useDocs()
  const language = useLanguage()

  return (
    <div data-component="doc-sidebar">
      <Show when={docs.isLoadingManifest()}>
        <DocSkeleton type="sidebar" />
      </Show>

      <Show when={!docs.isLoadingManifest() && !docs.manifest()}>
        <div
          style={{
            padding: "24px 16px",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            gap: "12px",
            color: "var(--vscode-descriptionForeground)",
            "text-align": "center",
          }}
        >
          <Icon name="book" size="large" />
          <span style={{ "font-size": "13px" }}>{language.t("docs.noDocs")}</span>
          <Button
            variant="secondary"
            size="small"
            icon="reset"
            onClick={() => docs.generateAll()}
            disabled={docs.isGenerating()}
          >
            {language.t("docs.generateAll")}
          </Button>
        </div>
      </Show>

      <Show when={docs.manifest()}>
        <div style={{ padding: "4px" }}>
          <div
            style={{
              "margin-bottom": "8px",
              "font-weight": 600,
              "font-size": "12px",
              "text-transform": "uppercase",
              color: "var(--vscode-descriptionForeground)",
            }}
          >
            {language.t("docs.pages")}
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <For
              fallback={
                <div style={{ padding: "4px", color: "var(--vscode-descriptionForeground)" }}>No pages yet.</div>
              }
              each={docs.manifest()?.pages || []}
            >
              {(page) => (
                <div
                  onClick={() => props.onSelectPage(page.id)}
                  style={{
                    padding: "6px 8px",
                    cursor: "pointer",
                    "border-radius": "4px",
                    display: "flex",
                    "justify-content": "space-between",
                    "align-items": "center",
                    "background-color": "var(--vscode-list-inactiveSelectionBackground)",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)"
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--vscode-list-inactiveSelectionBackground)"
                  }}
                >
                  <div style={{ display: "flex", "flex-direction": "column" }}>
                    <span style={{ "font-size": "13px" }}>{page.title}</span>
                    <span style={{ "font-size": "11px", color: "var(--vscode-descriptionForeground)" }}>
                      {page.path}
                    </span>
                  </div>
                  <span
                    style={{
                      "font-size": "10px",
                      padding: "2px 4px",
                      "border-radius": "3px",
                      "background-color":
                        page.status === "generated"
                          ? "var(--vscode-testing-iconPassed)"
                          : "var(--vscode-testing-iconQueued)",
                      color: "white",
                    }}
                  >
                    {page.status}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}
