import { createSignal, onCleanup } from "solid-js"
import type { Component } from "solid-js"
import { DialogProvider } from "@stratacode/strata-ui/context/dialog"
import { CodeComponentProvider } from "@stratacode/strata-ui/context/code"
import { DiffComponentProvider } from "@stratacode/strata-ui/context/diff"
import { FileComponentProvider } from "@stratacode/strata-ui/context/file"
import { MarkedProvider } from "@stratacode/strata-ui/context/marked"
import { Code } from "@stratacode/strata-ui/code"
import { Diff } from "@stratacode/strata-ui/diff"
import { File } from "@stratacode/strata-ui/file"
import { ThemeProvider } from "@stratacode/strata-ui/theme"
import { Toast } from "@stratacode/strata-ui/toast"
import { FullScreenDiffView } from "../agent-manager/FullScreenDiffView"
import { LanguageProvider } from "../src/context/language"
import { ServerProvider, useServer } from "../src/context/server"
import { getVSCodeAPI, VSCodeProvider, useVSCode } from "../src/context/vscode"
import type { ReviewComment, WorktreeFileDiff } from "../src/types/messages"
import type { ExplainAnnotation } from "../agent-manager/explain-annotations"

type DiffStyle = "unified" | "split"

const post = (message: Record<string, unknown>) => getVSCodeAPI().postMessage(message as never)

const DiffViewerContent: Component = () => {
  const vscode = useVSCode()
  const [diffs, setDiffs] = createSignal<WorktreeFileDiff[]>([])
  const [loading, setLoading] = createSignal(true)
  const [comments, setComments] = createSignal<ReviewComment[]>([])
  const [diffStyle, setDiffStyle] = createSignal<DiffStyle>("unified")
  const [reverting, setReverting] = createSignal<Set<string>>(new Set())
  const [explanations, setExplanations] = createSignal<ExplainAnnotation[]>([])
  const [explainingFiles, setExplainingFiles] = createSignal<Set<string>>(new Set())
  const [explaining, setExplaining] = createSignal(false)
  let nextExplainId = 0

  const markReverting = (file: string, active: boolean) => {
    setReverting((prev) => {
      const next = new Set(prev)
      if (active) next.add(file)
      else next.delete(file)
      return next
    })
  }

  const unsubscribe = vscode.onMessage((msg) => {
    if (msg.type === "diffViewer.diffs") {
      setDiffs(msg.diffs)
      return
    }

    if (msg.type === "diffViewer.loading") {
      setLoading(msg.loading)
      return
    }

    if (msg.type === "diffViewer.revertFileResult") {
      markReverting(msg.file, false)
      return
    }

    // Extension host sends explanation result for a single file
    if (msg.type === "diffViewer.explanationResult" && typeof msg.file === "string" && typeof msg.text === "string") {
      const id = `explain-${++nextExplainId}-${Date.now()}`
      setExplanations((prev) => [...prev, { id, file: msg.file, side: "additions" as const, line: 1, text: msg.text }])
      setExplainingFiles((prev) => {
        const next = new Set(prev)
        next.delete(msg.file)
        return next
      })
      if (explainingFiles().size === 0) setExplaining(false)
      return
    }

    // Extension host asks webview to trigger explain-all
    if (msg.type === "diffViewer.triggerExplainAll") {
      explainAll()
      return
    }
  })

  const handler = (event: MessageEvent) => {
    const msg = event.data
    if (msg?.type !== "appendReviewComments" || !Array.isArray(msg.comments)) return
    post({ type: "diffViewer.sendComments", comments: msg.comments, autoSend: !!msg.autoSend })
  }

  window.addEventListener("message", handler)
  onCleanup(() => {
    unsubscribe()
    window.removeEventListener("message", handler)
  })

  const explainFile = (file: string) => {
    setExplainingFiles((prev) => {
      const next = new Set(prev)
      next.add(file)
      return next
    })
    setExplaining(true)
    const diff = diffs().find((d) => d.file === file)
    const patch = diff ? buildPatch(diff) : ""
    post({ type: "diffViewer.explainFile", file, patch })
  }

  const explainAll = () => {
    setExplaining(true)
    for (const diff of diffs()) {
      explainFile(diff.file)
    }
  }

  const dismissExplanation = (id: string) => {
    setExplanations((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <FullScreenDiffView
      diffs={diffs()}
      loading={loading()}
      sessionKey="local"
      comments={comments()}
      onCommentsChange={setComments}
      onSendAll={() => {}}
      diffStyle={diffStyle()}
      onDiffStyleChange={(style) => {
        setDiffStyle(style)
        post({ type: "diffViewer.setDiffStyle", style })
      }}
      onOpenFile={(relativePath) => {
        post({ type: "openFile", filePath: relativePath })
      }}
      onRevertFile={(file) => {
        markReverting(file, true)
        post({ type: "diffViewer.revertFile", file })
      }}
      revertingFiles={reverting()}
      explanations={explanations()}
      onExplainFile={explainFile}
      onExplainAll={explainAll}
      onDismissExplanation={dismissExplanation}
      explaining={explaining()}
      explainingFiles={explainingFiles()}
      onClose={() => {
        post({ type: "diffViewer.close" })
      }}
    />
  )
}

/** Build a minimal unified patch string from a WorktreeFileDiff for explain prompts */
function buildPatch(diff: WorktreeFileDiff): string {
  const before = diff.before.split("\n")
  const after = diff.after.split("\n")
  if (before.join("\n") === after.join("\n")) return ""
  const lines: string[] = []
  lines.push(`--- a/${diff.file}`)
  lines.push(`+++ b/${diff.file}`)
  // Simple whole-file diff for prompt context
  const max = Math.max(before.length, after.length)
  for (let i = 0; i < max; i++) {
    const a = before[i]
    const b = after[i]
    if (a === b) {
      lines.push(` ${a ?? ""}`)
    } else {
      if (a !== undefined) lines.push(`-${a}`)
      if (b !== undefined) lines.push(`+${b}`)
    }
  }
  return lines.join("\n")
}

const DiffViewerShell: Component = () => {
  const server = useServer()

  return (
    <LanguageProvider vscodeLanguage={server.vscodeLanguage} languageOverride={server.languageOverride}>
      <DiffComponentProvider component={Diff}>
        <CodeComponentProvider component={Code}>
          <FileComponentProvider component={File}>
            <MarkedProvider>
              <DiffViewerContent />
            </MarkedProvider>
          </FileComponentProvider>
        </CodeComponentProvider>
      </DiffComponentProvider>
    </LanguageProvider>
  )
}

export const DiffViewerApp: Component = () => {
  return (
    <ThemeProvider defaultTheme="strata-vscode">
      <DialogProvider>
        <VSCodeProvider>
          <ServerProvider>
            <DiffViewerShell />
          </ServerProvider>
        </VSCodeProvider>
      </DialogProvider>
      <Toast.Region />
    </ThemeProvider>
  )
}
