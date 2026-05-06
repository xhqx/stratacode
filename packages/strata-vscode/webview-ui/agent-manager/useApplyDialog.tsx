import { createSignal, createMemo, createEffect, on, onCleanup } from "solid-js"
import { produce } from "solid-js/store"
import { ApplyDialog } from "./ApplyDialog"
import { groupApplyConflicts } from "./apply-conflicts"
import { LOCAL } from "./navigate"
import type { 
  WorktreeFileDiff, 
  AgentManagerApplyWorktreeDiffStatus, 
  AgentManagerApplyWorktreeDiffConflict, 
  SessionInfo,
  AgentManagerApplyWorktreeDiffResultMessage,
  ExtensionMessage,
  ManagedSessionState
} from "../src/types/messages"

export interface ApplyState {
  status: AgentManagerApplyWorktreeDiffStatus
  message: string
  conflicts: AgentManagerApplyWorktreeDiffConflict[]
}

export interface UseApplyDialogProps {
  vscode: any
  t: (key: string) => string
  dialog: any
  selection: () => string | null
  managedSessions: () => ManagedSessionState[]
  diffDatas: () => Record<string, WorktreeFileDiff[]>
  diffLoading: () => boolean
  worktrees: () => { id: string }[]
}

export function useApplyDialog(props: UseApplyDialogProps) {
  const { vscode, t, dialog, selection, managedSessions, diffDatas, diffLoading, worktrees } = props

  const [applyStates, setApplyStates] = createSignal<Record<string, ApplyState>>({})
  const [applyTarget, setApplyTarget] = createSignal<string | undefined>()
  const [applySelectedFiles, setApplySelectedFiles] = createSignal<string[]>([])
  const [applySelectionTouched, setApplySelectionTouched] = createSignal(false)

  createEffect(() => {
    const ids = new Set(worktrees().map((wt) => wt.id))
    setApplyStates((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)))
      if (Object.keys(next).length === Object.keys(prev).length) return prev
      return next
    })

    const target = applyTarget()
    if (target && !ids.has(target)) closeApplyDialog()
  })

  const resolveWorktreeSessionId = (worktreeId: string, id?: string) => {
    if (id) {
      const current = managedSessions().find((entry) => entry.id === id)
      if (current?.worktreeId === worktreeId) return id
    }
    return managedSessions().find((entry) => entry.worktreeId === worktreeId)?.id
  }

  const applyTargetSessionId = createMemo(() => {
    const target = applyTarget()
    if (!target) return undefined
    return resolveWorktreeSessionId(target)
  })

  const applyDiffs = createMemo(() => {
    const target = applyTarget()
    if (!target) return [] as WorktreeFileDiff[]
    const data = diffDatas()
    const current = applyTargetSessionId()
    if (current && data[current]) return data[current]!
    const ids = managedSessions()
      .filter((entry) => entry.worktreeId === target)
      .map((entry) => entry.id)
    for (const id of ids) {
      if (data[id]) return data[id]!
    }
    return [] as WorktreeFileDiff[]
  })

  const applyStateForTarget = createMemo(() => {
    const target = applyTarget()
    if (!target) return undefined
    return applyStates()[target]
  })

  const applyBusyForTarget = createMemo(() => {
    const state = applyStateForTarget()
    if (!state) return false
    return state.status === "checking" || state.status === "applying"
  })

  const applySelectedSet = createMemo(() => new Set(applySelectedFiles()))

  const applySelectionStats = createMemo(() => {
    const set = applySelectedSet()
    const selected = applyDiffs().filter((diff) => set.has(diff.file))
    const additions = selected.reduce((sum, diff) => sum + diff.additions, 0)
    const deletions = selected.reduce((sum, diff) => sum + diff.deletions, 0)
    return {
      total: applyDiffs().length,
      selected: selected.length,
      additions,
      deletions,
    }
  })

  const applyHasSelection = createMemo(() => applySelectionStats().selected > 0)

  const applyConflictRows = createMemo(() => groupApplyConflicts(applyStateForTarget()?.conflicts ?? []))

  const applyToLocal = (worktreeId: string, selectedFiles: string[]) => {
    setApplyStates((prev) => ({
      ...prev,
      [worktreeId]: {
        status: "checking",
        message: t("agentManager.apply.checking"),
        conflicts: [],
      },
    }))
    vscode.postMessage({ type: "agentManager.applyWorktreeDiff", worktreeId, selectedFiles })
  }

  const resetApplyDialog = () => {
    setApplyTarget(undefined)
    setApplySelectedFiles([])
    setApplySelectionTouched(false)
  }

  const closeApplyDialog = () => {
    resetApplyDialog()
    dialog.close()
  }

  const applySelectAll = () => {
    setApplySelectionTouched(true)
    setApplySelectedFiles(applyDiffs().map((diff) => diff.file))
  }

  const applySelectNone = () => {
    setApplySelectionTouched(true)
    setApplySelectedFiles([])
  }

  const applyToggleFile = (file: string, checked: boolean) => {
    setApplySelectionTouched(true)
    setApplySelectedFiles((prev) => {
      if (checked) {
        if (prev.includes(file)) return prev
        const set = new Set(prev)
        set.add(file)
        return applyDiffs()
          .map((diff) => diff.file)
          .filter((path) => set.has(path))
      }
      if (!prev.includes(file)) return prev
      return prev.filter((path) => path !== file)
    })
  }

  const triggerApply = () => {
    const target = applyTarget()
    if (!target) return
    if (!applyHasSelection()) return
    if (applyBusyForTarget()) return
    applyToLocal(target, applySelectedFiles())
  }

  const openApplyDialog = () => {
    const sel = selection()
    if (!sel || sel === LOCAL) return
    setApplyStates((prev) => {
      if (!prev[sel]) return prev
      const next = { ...prev }
      delete next[sel]
      return next
    })
    setApplyTarget(sel)
    setApplySelectionTouched(false)
    setApplySelectedFiles([])
    const sid = resolveWorktreeSessionId(sel)
    if (sid) vscode.postMessage({ type: "agentManager.requestWorktreeDiff", sessionId: sid })

    setApplySelectedFiles(applyDiffs().map((diff) => diff.file))

    dialog.show(
      () => (
        <ApplyDialog
          diffs={applyDiffs()}
          loading={diffLoading()}
          selectedFiles={applySelectedSet()}
          selectedCount={applySelectionStats().selected}
          additions={applySelectionStats().additions}
          deletions={applySelectionStats().deletions}
          busy={applyBusyForTarget()}
          hasSelection={applyHasSelection()}
          status={applyStateForTarget()?.status}
          message={applyStateForTarget()?.message}
          conflictRows={applyConflictRows()}
          onSelectAll={applySelectAll}
          onSelectNone={applySelectNone}
          onToggleFile={applyToggleFile}
          onApply={triggerApply}
          onClose={closeApplyDialog}
        />
      ),
      resetApplyDialog,
    )
  }

  createEffect(
    on(
      () => [applyTarget(), applyDiffs(), applySelectionTouched()] as const,
      ([target, diffs, touched]) => {
        if (!target) return
        const files = diffs.map((diff) => diff.file)
        if (files.length === 0) {
          if (!touched) setApplySelectedFiles([])
          return
        }

        if (!touched) {
          setApplySelectedFiles(files)
          return
        }

        const current = applySelectedFiles()
        const set = new Set(current)
        const next = files.filter((file) => set.has(file))
        const same = next.length === current.length && next.every((file, index) => file === current[index])
        if (!same) setApplySelectedFiles(next)
      },
    ),
  )

  const handleMessage = (msg: ExtensionMessage) => {
    if (msg.type === "agentManager.applyWorktreeDiffResult") {
      const ev = msg as AgentManagerApplyWorktreeDiffResultMessage
      setApplyStates((prev) => ({
        ...prev,
        [ev.worktreeId]: {
          status: ev.status,
          message: ev.message,
          conflicts: ev.conflicts ?? [],
        },
      }))
    }
  }

  const unsub = vscode.onMessage(handleMessage)
  onCleanup(unsub)

  const applyStateForSelection = createMemo(() => {
    const sel = selection()
    if (!sel || sel === LOCAL) return undefined
    return applyStates()[sel]
  })

  return {
    openApplyDialog,
    closeApplyDialog,
    resolveWorktreeSessionId,
    applyTarget,
    applyStateForSelection,
  }
}
