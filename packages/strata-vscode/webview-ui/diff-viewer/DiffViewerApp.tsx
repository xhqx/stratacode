import { createSignal, createEffect, on, onCleanup } from "solid-js"
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
import { diffLines } from "diff"

type DiffStyle = "unified" | "split"

const CACHE_TTL_MS = 90 * 60 * 1000 // 90 minutes

interface CachedExplanation {
  text: string
  hash: string
  timestamp: number
}

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
  const [openFiles, setOpenFiles] = createSignal<string[]>([])
  const [autoExplain, setAutoExplain] = createSignal(true)
  const [branch, setBranch] = createSignal<string | undefined>()
  let nextExplainId = 0
  const cache = new Map<string, CachedExplanation>()

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

    if (msg.type === "ready" && typeof msg.autoExplain === "boolean") {
      setAutoExplain(msg.autoExplain)
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
      const cleanText = msg.text.replace(/`/g, "").trim()
      const isSkipped = /^\s*<?skip>?\s*$/i.test(cleanText)
      if (!isSkipped) {
        const line = typeof msg.line === "number" ? msg.line : 1
        const id = `explain-${++nextExplainId}-${Date.now()}`
        setExplanations((prev) => [...prev, { id, file: msg.file, side: "additions" as const, line, text: msg.text }])
        // Store in cache for TTL reuse
        const diff = diffs().find((d) => d.file === msg.file)
        if (diff) {
          cache.set(`${msg.file}:${line}`, { text: msg.text, hash: hashDiff(diff), timestamp: Date.now() })
        }
      }
      setExplainingFiles((prev) => {
        const next = new Set(prev)
        next.delete(msg.file)
        return next
      })
      if (explainingFiles().size === 0) setExplaining(false)
      return
    }

    if (msg.type === "diffViewer.diffFile" && typeof msg.file === "string") {
      if (!msg.diff) return
      setDiffs((prev) =>
        prev.map((d) => (d.file === msg.file ? { ...d, ...msg.diff, summarized: false } : d))
      )
      return
    }

    // Extension host asks webview to trigger explain-all (scoped to open files)
    if (msg.type === "diffViewer.triggerExplainAll") {
      explainOpen()
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

  const hashDiff = (diff: WorktreeFileDiff): string =>
    `${diff.file}:${diff.status}:${diff.additions}:${diff.deletions}:${diff.patch ?? ""}`

  const isCacheValid = (file: string, diff: WorktreeFileDiff | undefined): boolean => {
    const entry = cache.get(file)
    if (!entry) return false
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return false
    if (!diff) return false
    return entry.hash === hashDiff(diff)
  }

  const restoreFromCache = (file: string): boolean => {
    const entry = cache.get(file)
    if (!entry) return false
    // Check if already displayed
    if (explanations().some((e) => e.file === file)) return true
    const id = `explain-${++nextExplainId}-${Date.now()}`
    setExplanations((prev) => [...prev, { id, file, side: "additions" as const, line: 1, text: entry.text }])
    return true
  }

  const explainFile = (file: string) => {
    const diff = diffs().find((d) => d.file === file)
    if (!diff) return
    const hunks = buildHunks(diff)
    if (hunks.length === 0) return
    setExplainingFiles((prev) => {
      const next = new Set(prev)
      next.add(file)
      return next
    })
    setExplaining(true)
    for (const hunk of hunks) {
      post({ type: "diffViewer.explainFile", file, patch: hunk.patch, line: hunk.line })
    }
  }

  // Explain only currently expanded files — never batch all
  const explainOpen = () => {
    const opened = openFiles()
    if (opened.length === 0) return
    setExplaining(true)
    setExplainingFiles((prev) => {
      const next = new Set(prev)
      for (const file of opened) next.add(file)
      return next
    })
    for (const file of opened) {
      explainFile(file)
    }
  }

  // Called when a file accordion is expanded
  const handleFileOpened = (file: string) => {
    // Gate behind autoExplain setting
    if (!autoExplain()) return
    const diff = diffs().find((d) => d.file === file)
    if (isCacheValid(file, diff)) {
      restoreFromCache(file)
      return
    }
    // Small delay to avoid triggering on rapid scrolling
    setTimeout(() => {
      // Re-check the file is still open
      if (!openFiles().includes(file)) return
      explainFile(file)
    }, 500)
  }

  // Invalidate stale cache entries when diffs change
  createEffect(
    on(
      () => diffs(),
      (current) => {
        for (const [file, entry] of cache) {
          const diff = current.find((d) => d.file === file)
          if (!diff || entry.hash !== hashDiff(diff)) {
            cache.delete(file)
            // Remove displayed explanation for this file
            setExplanations((prev) => prev.filter((e) => e.file !== file))
          }
        }
      },
      { defer: true },
    ),
  )

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
      onRequestDiff={(file) => {
        post({ type: "diffViewer.requestDiff", file })
      }}
      onRevertFile={(file) => {
        markReverting(file, true)
        post({ type: "diffViewer.revertFile", file })
      }}
      revertingFiles={reverting()}
      explanations={explanations()}
      onExplainFile={explainFile}
      onExplainAll={explainOpen}
      onDismissExplanation={dismissExplanation}
      explaining={explaining()}
      explainingFiles={explainingFiles()}
      onFileOpened={(file) => {
        setOpenFiles((prev) => (prev.includes(file) ? prev : [...prev, file]))
        handleFileOpened(file)
      }}
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

interface Hunk {
  line: number
  patch: string
}

/**
 * Extract contiguous change groups from a diff using the diff library.
 * Each hunk has a starting line number (in the "after" content) attached
 * to the END of the changed block.
 */
function buildHunks(diff: WorktreeFileDiff): Hunk[] {
  if (diff.before === diff.after) return []
  const changes = diffLines(diff.before, diff.after)

  const hunks: Hunk[] = []
  let beforeLine = 1
  let afterLine = 1

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]

    if (change.added || change.removed) {
      // Collect adjacent changes into one hunk
      let j = i
      let addedStr = ""
      let removedStr = ""

      const hunkAfterStart = afterLine

      while (j < changes.length && (changes[j].added || changes[j].removed)) {
        if (changes[j].added) {
          addedStr += changes[j].value
        }
        if (changes[j].removed) {
          removedStr += changes[j].value
        }
        j++
      }

      let hunkAfterEnd = hunkAfterStart

      const patchLines: string[] = [`--- a/${diff.file}`, `+++ b/${diff.file}`]

      // Add 1 context line before
      if (i > 0 && !changes[i - 1].added && !changes[i - 1].removed) {
        const lines = changes[i - 1].value.split("\n")
        if (lines[lines.length - 1] === "") lines.pop()
        if (lines.length > 0) {
          patchLines.push(" " + lines[lines.length - 1])
        }
      }

      // Add the removed lines
      if (removedStr) {
        const lines = removedStr.split("\n")
        if (lines[lines.length - 1] === "") lines.pop()
        lines.forEach((l) => patchLines.push("-" + l))
      }

      // Add the added lines
      if (addedStr) {
        const lines = addedStr.split("\n")
        if (lines[lines.length - 1] === "") lines.pop()
        lines.forEach((l) => patchLines.push("+" + l))
        hunkAfterEnd = hunkAfterStart + lines.length - 1
      } else {
        // Pure deletion: attach to the line immediately preceding the deletion
        hunkAfterEnd = Math.max(1, hunkAfterStart - 1)
      }

      // Add 1 context line after
      if (j < changes.length && !changes[j].added && !changes[j].removed) {
        const lines = changes[j].value.split("\n")
        if (lines[lines.length - 1] === "") lines.pop()
        if (lines.length > 0) {
          patchLines.push(" " + lines[0])
        }
      }

      hunks.push({
        line: hunkAfterEnd > 0 ? hunkAfterEnd : 1,
        patch: patchLines.join("\n"),
      })

      // Update counters
      for (let k = i; k < j; k++) {
        const lines = changes[k].value.split("\n")
        if (lines[lines.length - 1] === "") lines.pop()
        const count = lines.length
        if (changes[k].added) afterLine += count
        if (changes[k].removed) beforeLine += count
      }

      i = j - 1 // skip the processed changes
    } else {
      const lines = change.value.split("\n")
      if (lines[lines.length - 1] === "") lines.pop()
      const count = lines.length
      beforeLine += count
      afterLine += count
    }
  }

  return hunks
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
