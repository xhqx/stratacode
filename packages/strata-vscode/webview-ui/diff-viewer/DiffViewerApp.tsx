import { batch, createSignal, onCleanup } from "solid-js"
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
  const [scroll, setScroll] = createSignal<HTMLDivElement>()
  const [eagerLoad, setEagerLoad] = createSignal(false)
  const [instantComments, setInstantComments] = createSignal(true)

  const preserveScroll = (fn: () => void) => {
    const el = scroll()
    if (!el) {
      fn()
      return
    }

    const item = Array.from(el.querySelectorAll<HTMLElement>('[data-slot="accordion-item"][data-file-path]')).find(
      (node) => node.getBoundingClientRect().bottom > el.getBoundingClientRect().top,
    )
    const path = item?.dataset.filePath
    const top = item ? item.getBoundingClientRect().top - el.getBoundingClientRect().top : undefined
    const fallback = el.scrollTop

    fn()

    const restore = () => {
      if (!path || top === undefined) {
        el.scrollTop = fallback
        return
      }

      const next = el.querySelector<HTMLElement>(`[data-slot="accordion-item"][data-file-path="${CSS.escape(path)}"]`)
      if (!next) {
        el.scrollTop = fallback
        return
      }

      const delta = next.getBoundingClientRect().top - el.getBoundingClientRect().top - top
      el.scrollTop += delta
    }

    requestAnimationFrame(() => {
      restore()
      requestAnimationFrame(restore)
    })
  }

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

    // New batch explainer results (may arrive incrementally)
    if (msg.type === "diffViewer.explainResult") {
      preserveScroll(() => {
        batch(() => {
          if (msg.done) setExplaining(false)
          setReviewThreads((prev) => {
            const next = [...prev]
            for (const thread of msg.threads) {
              const existing = next.findIndex((t) => t.id === thread.id)
              if (existing !== -1) {
                next[existing] = thread
              } else {
                next.push(thread)
              }
            }
            return next
          })
          if (msg.summary) setReviewSummary(msg.summary)
        })
      })
      return
    }

    if (msg.type === "diffViewer.explainError") {
      setExplaining(false)
      // Display error message somewhere, e.g. toast
      return
    }

    if (msg.type === "diffViewer.clearExplanations") {
      preserveScroll(() => {
        batch(() => {
          setReviewThreads([])
          setReviewSummary("")
        })
      })
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
              pending: false,
            }
          }
          return t
        }),
      )
      return
    }

    if (msg.type === "diffViewer.diffFile" && typeof msg.file === "string") {
      if (!msg.diff) return
      setDiffs((prev) => prev.map((d) => (d.file === msg.file ? { ...d, ...msg.diff, summarized: false } : d)))
      return
    }

    if (msg.type === "settingLoaded" && msg.key === "diff.eagerLoad") {
      setEagerLoad(msg.value as boolean)
      return
    }

    if (msg.type === "settingLoaded" && msg.key === "diffViewer.instantComments") {
      setInstantComments(msg.value as boolean)
      return
    }
  })

  // Request settings on init
  post({ type: "requestSetting", key: "diff.eagerLoad" })
  post({ type: "requestSetting", key: "diffViewer.instantComments" })

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
    preserveScroll(() => {
      batch(() => {
        setExplaining(true)
        setReviewSummary("")
        setReviewThreads([])
      })
    })
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
      prev.map((t) => (t.id === threadId ? { ...t, messages: [...t.messages, msg], pending: true } : t)),
    )
    post({ type: "diffViewer.replyToThread", threadId, text })
  }

  const handleStartThread = (
    threadId: string,
    file: string,
    side: "additions" | "deletions",
    line: number,
    endLine: number | undefined,
    text: string,
  ) => {
    // Immediately append user message and mark thread as pending
    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      author: "user" as const,
      text,
      timestamp: Date.now(),
    }
    setReviewThreads((prev) => [
      ...prev,
      {
        id: threadId,
        file,
        side,
        line,
        ...(endLine !== undefined ? { endLine } : {}),
        messages: [msg],
        pending: true,
      },
    ])
    post({
      type: "diffViewer.startThread",
      threadId,
      file,
      line,
      endLine,
      text,
      side: side === "additions" ? "right" : "left",
    })
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
      eagerLoad={eagerLoad()}
      instantComments={instantComments()}
      // New review thread props
      reviewThreads={reviewThreads()}
      reviewSummary={reviewSummary()}
      onExplainAll={explainAll}
      onThreadReply={handleThreadReply}
      onStartThread={handleStartThread}
      explaining={explaining() || reviewThreads().some((t) => t.pending)}
      onScrollContainerChange={setScroll}
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
