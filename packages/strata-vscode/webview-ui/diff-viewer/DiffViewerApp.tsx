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
import type { ReviewComment, WorktreeFileDiff, ReviewThread } from "../src/types/messages"

type DiffStyle = "unified" | "split"

const post = (message: Record<string, unknown>) => getVSCodeAPI().postMessage(message as never)

const DiffViewerContent: Component = () => {
  const vscode = useVSCode()
  const [diffs, setDiffs] = createSignal<WorktreeFileDiff[]>([])
  const [loading, setLoading] = createSignal(true)
  const [comments, setComments] = createSignal<ReviewComment[]>([])
  const [diffStyle, setDiffStyle] = createSignal<DiffStyle>("unified")
  const [reverting, setReverting] = createSignal<Set<string>>(new Set())
  const [explaining, setExplaining] = createSignal(false)
  const [branch, setBranch] = createSignal<string | undefined>()
  const [reviewThreads, setReviewThreads] = createSignal<ReviewThread[]>([])
  const [reviewSummary, setReviewSummary] = createSignal("")

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

    if (msg.type === "diffViewer.branch" && typeof msg.branch === "string") {
      setBranch(msg.branch)
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

    // New batch explainer results
    if (msg.type === "diffViewer.explainResult") {
      setExplaining(false)
      if (msg.threads) {
        // Create review threads from results
        // Use the new ReviewThread format directly
        setReviewThreads(msg.threads)
      }
      if (msg.summary) {
        setReviewSummary(msg.summary)
      }
      return
    }

    if (msg.type === "diffViewer.explainError") {
      setExplaining(false)
      // Display error message somewhere, e.g. toast
      return
    }

    if (msg.type === "diffViewer.threadReply") {
      // Update specific thread with AI reply and clear pending
      setReviewThreads((prev) => 
        prev.map((t) => {
          if (t.id === msg.threadId) {
            return {
              ...t,
              messages: [...t.messages, msg.message],
              pending: false
            }
          }
          return t
        })
      )
      return
    }

    if (msg.type === "diffViewer.diffFile" && typeof msg.file === "string") {
      if (!msg.diff) return
      setDiffs((prev) =>
        prev.map((d) => (d.file === msg.file ? { ...d, ...msg.diff, summarized: false } : d))
      )
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

  const explainAll = () => {
    setExplaining(true)
    setReviewSummary("")
    post({ type: "diffViewer.explainAll" })
  }

  const handleThreadReply = (threadId: string, text: string) => {
    // Immediately append user message and mark thread as pending
    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      author: "user" as const,
      text,
      timestamp: Date.now(),
    }
    setReviewThreads((prev) => 
      prev.map((t) => t.id === threadId ? { ...t, messages: [...t.messages, msg], pending: true } : t)
    )
    post({ type: "diffViewer.replyToThread", threadId, text })
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
      onOpenFile={(relativePath, line) => {
        post({ type: "openFile", filePath: relativePath, line })
      }}
      onRequestDiff={(file) => {
        post({ type: "diffViewer.requestDiff", file })
      }}
      onRevertFile={(file) => {
        markReverting(file, true)
        post({ type: "diffViewer.revertFile", file })
      }}
      revertingFiles={reverting()}
      
      // New review thread props
      reviewThreads={reviewThreads()}
      reviewSummary={reviewSummary()}
      onExplainAll={explainAll}
      onThreadReply={handleThreadReply}
      explaining={explaining() || reviewThreads().some((t) => t.pending)}
      
      onClose={() => {
        post({ type: "diffViewer.close" })
      }}
    />
  )
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
