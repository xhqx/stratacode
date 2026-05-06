import { Show, createEffect, onMount } from "solid-js"
import { Markdown } from "@stratacode/strata-ui/markdown"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { useDocs } from "../../context/docs"
import { useLanguage } from "../../context/language"
import { DocSkeleton } from "./DocSkeleton"

interface Props {
  pageId: string
}

export function DocPageView(props: Props) {
  const docs = useDocs()
  const language = useLanguage()

  createEffect(() => {
    // When pageId changes, request the new page
    if (props.pageId) {
      docs.requestPage(props.pageId)
    }
  })

  // Re-fetch on mount just in case
  onMount(() => {
    if (props.pageId) {
      docs.requestPage(props.pageId)
    }
  })

  return (
    <div data-component="doc-page-view" style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <Show when={docs.isLoadingPage()}>
        <DocSkeleton type="page" />
      </Show>

      <Show when={!docs.isLoadingPage() && !docs.currentPage()}>
        <div style={{ padding: "16px", color: "var(--vscode-descriptionForeground)" }}>
          {language.t("docs.notFound")}
        </div>
      </Show>

      <Show when={!docs.isLoadingPage() && docs.currentPage()}>
        <div style={{ display: "flex", "justify-content": "flex-end", "margin-bottom": "8px" }}>
          <Show when={docs.isGenerating()}>
            <span
              style={{
                "font-size": "12px",
                color: "var(--vscode-descriptionForeground)",
                "margin-right": "8px",
                "align-self": "center",
              }}
            >
              {language.t("docs.generating")}
            </span>
          </Show>
          <IconButton
            icon="reset"
            size="small"
            variant="ghost"
            onClick={() => docs.regeneratePage(props.pageId)}
            disabled={docs.isGenerating()}
            title={language.t("docs.regenerate")}
          />
        </div>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            "background-color": "var(--vscode-editor-background)",
            border: "1px solid var(--vscode-panel-border)",
            "border-radius": "4px",
            padding: "16px",
          }}
        >
          <Markdown text={docs.currentPage()!.content} />
        </div>
      </Show>
    </div>
  )
}
