import { createSignal, createMemo, createEffect } from "solid-js"
import type { ReviewComment } from "./review-comments"
import { LOCAL } from "./navigate"
import type { WorktreeFileDiff, ManagedSessionState } from "../src/types/messages"

export interface UseReviewStateProps {
  selection: () => string | null
  setSidePanel: (panel: "diff" | "pr" | null) => void
  REVIEW_TAB_ID: string
  reviewActive: () => boolean
  setReviewActive: (active: boolean) => void
  diffDatas: () => Record<string, WorktreeFileDiff[]>
  managedSessions: () => ManagedSessionState[]
  session: any // Need the session facade
  worktrees: () => { id: string }[]
}

export function useReviewState(props: UseReviewStateProps) {
  const { 
    selection, 
    setSidePanel, 
    REVIEW_TAB_ID,
    reviewActive,
    setReviewActive,
    diffDatas,
    managedSessions,
    session,
    worktrees,
  } = props

  const [reviewOpenByContext, setReviewOpenByContext] = createSignal<Record<string, boolean>>({})
  const [reviewCommentsByContext, setReviewCommentsByContext] = createSignal<Record<string, ReviewComment[]>>({})

  createEffect(() => {
    const ids = new Set(worktrees().map((wt) => wt.id))
    setReviewOpenByContext((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => id === LOCAL || ids.has(id)))
      if (Object.keys(next).length === Object.keys(prev).length) return prev
      return next
    })
    setReviewCommentsByContext((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => id === LOCAL || ids.has(id)))
      if (Object.keys(next).length === Object.keys(prev).length) return prev
      return next
    })
  })

  const reviewOpen = createMemo(() => {
    const sel = selection()
    if (sel === null) return false
    return reviewOpenByContext()[sel] === true
  })

  const setReviewOpenForContext = (context: string, open: boolean) => {
    setReviewOpenByContext((prev) => {
      if (prev[context] === open) return prev
      return { ...prev, [context]: open }
    })
  }

  const setReviewOpenForSelection = (open: boolean) => {
    const sel = selection()
    if (sel === null) return
    setReviewOpenForContext(sel, open)
  }

  const reviewComments = createMemo(() => {
    const sel = selection()
    if (sel === null) return [] as ReviewComment[]
    return reviewCommentsByContext()[sel] ?? []
  })

  const setReviewCommentsForSelection = (comments: ReviewComment[]) => {
    const sel = selection()
    if (sel === null) return
    setReviewCommentsByContext((prev) => ({ ...prev, [sel]: comments }))
  }

  const openReviewTab = () => {
    const sel = selection()
    if (sel === null) return
    setSidePanel(null)
    setReviewOpenForSelection(true)
    setReviewActive(true)
  }

  const toggleReviewTab = () => {
    if (reviewActive()) {
      closeReviewTab()
      return
    }
    openReviewTab()
  }

  const closeReviewTab = () => {
    setReviewActive(false)
    setReviewOpenForSelection(false)
  }

  const reviewDiffs = createMemo(() => {
    const data = diffDatas()
    const sel = selection()
    const id = session.currentSessionID()
    if (sel === LOCAL) return data[LOCAL] ?? []
    if (id && data[id]) {
      const current = managedSessions().find((s) => s.id === id)
      if (sel && current?.worktreeId === sel) return data[id]!
    }
    if (!sel) return [] as WorktreeFileDiff[]
    const ids = managedSessions()
      .filter((s) => s.worktreeId === sel)
      .map((s) => s.id)
    for (const sid of ids) {
      if (data[sid]) return data[sid]!
    }
    return [] as WorktreeFileDiff[]
  })

  const currentDiffSessionId = createMemo(() => {
    const sel = selection()
    if (sel === LOCAL) return LOCAL

    const current = session.currentSessionID()
    if (current) {
      const item = managedSessions().find((entry) => entry.id === current)
      if (sel && item?.worktreeId === sel) return current
    }

    if (!sel) return undefined
    return managedSessions().find((entry) => entry.worktreeId === sel)?.id
  })

  const diffSessionKey = createMemo(() => {
    const sel = selection()
    if (sel === LOCAL) return `local:${LOCAL}`
    if (sel === null) return `session:${session.currentSessionID() ?? ""}`
    return `worktree:${sel}`
  })

  return {
    reviewOpenByContext,
    reviewOpen,
    setReviewOpenForContext,
    setReviewOpenForSelection,
    reviewCommentsByContext,
    reviewComments,
    setReviewCommentsForSelection,
    openReviewTab,
    toggleReviewTab,
    closeReviewTab,
    reviewDiffs,
    currentDiffSessionId,
    diffSessionKey,
  }
}
