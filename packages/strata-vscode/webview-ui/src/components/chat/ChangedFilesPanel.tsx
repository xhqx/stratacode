/**
 * ChangedFilesPanel
 * Displays a compact list of all files the AI has modified during the current
 * session, with addition/deletion counts and a quick-open action per file.
 */

import { type Component, For, Show } from "solid-js"
import { FileIcon } from "@stratacode/strata-ui/file-icon"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { DiffChanges } from "@stratacode/strata-ui/diff-changes"
import { Tooltip } from "@stratacode/strata-ui/tooltip"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { useChangedFiles } from "../../hooks/useChangedFiles"

export const ChangedFilesPanel: Component = () => {
  const { t } = useLanguage()
  const vscode = useVSCode()
  const { files } = useChangedFiles()

  const open = (path: string) => {
    vscode.postMessage({ type: "openFile", filePath: path })
  }

  const totals = () => {
    const all = files()
    return {
      count: all.length,
      adds: all.reduce((s, f) => s + f.additions, 0),
      dels: all.reduce((s, f) => s + f.deletions, 0),
    }
  }

  return (
    <div data-component="changed-files-panel">
      <Show
        when={files().length > 0}
        fallback={
          <div data-slot="changed-files-empty">{t("chat.changedFiles.empty")}</div>
        }
      >
        <div data-slot="changed-files-summary">
          <span data-slot="changed-files-count">
            {t("chat.changedFiles.summary", { count: String(totals().count) })}
          </span>
          <DiffChanges changes={{ additions: totals().adds, deletions: totals().dels }} />
        </div>
        <div data-slot="changed-files-list">
          <For each={files()}>
            {(file) => (
              <div data-slot="changed-files-row">
                <div data-slot="changed-files-file-info">
                  <FileIcon node={{ path: file.path, type: "file" }} />
                  <div data-slot="changed-files-name-wrap">
                    <Show when={file.dir}>
                      <span data-slot="changed-files-dir">{`\u2066${file.dir}/\u2069`}</span>
                    </Show>
                    <span data-slot="changed-files-name">{file.name}</span>
                  </div>
                </div>
                <div data-slot="changed-files-row-actions">
                  <DiffChanges changes={{ additions: file.additions, deletions: file.deletions }} />
                  <Show when={file.status === "added"}>
                    <span data-slot="changed-files-badge" data-type="added">
                      {t("ui.sessionReview.change.added")}
                    </span>
                  </Show>
                  <Show when={file.status === "deleted"}>
                    <span data-slot="changed-files-badge" data-type="removed">
                      {t("ui.sessionReview.change.removed")}
                    </span>
                  </Show>
                  <Tooltip value={t("chat.changedFiles.openFile")} placement="top">
                    <IconButton
                      icon="go-to-file"
                      size="small"
                      variant="ghost"
                      label={t("chat.changedFiles.openFile")}
                      onClick={() => open(file.path)}
                    />
                  </Tooltip>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
