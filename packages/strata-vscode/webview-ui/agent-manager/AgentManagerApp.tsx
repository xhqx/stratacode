/** @jsxImportSource solid-js */

import {
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  on,
  onMount,
  onCleanup,
  type Accessor,
  type Component,
} from "solid-js"
import type {
  ExtensionMessage,
  AgentManagerRepoInfoMessage,
  AgentManagerWorktreeSetupMessage,
  AgentManagerStateMessage,
  AgentManagerKeybindingsMessage,
  AgentManagerMultiVersionProgressMessage,
  AgentManagerSendInitialMessage,
  AgentManagerBranchesMessage,
  AgentManagerWorktreeDiffMessage,
  AgentManagerWorktreeDiffFileMessage,
  AgentManagerWorktreeDiffLoadingMessage,
  AgentManagerApplyWorktreeDiffResultMessage,
  AgentManagerApplyWorktreeDiffStatus,
  AgentManagerApplyWorktreeDiffConflict,
  AgentManagerWorktreeStatsMessage,
  AgentManagerLocalStatsMessage,
  WorktreeFileDiff,
  WorktreeGitStats,
  LocalGitStats,
  WorktreeState,
  RunStatus,
  PRStatus,
  AgentManagerPRStatusMessage,
  ManagedSessionState,
  SectionState,
  SessionInfo,
  BranchInfo,
} from "../src/types/messages"
import { IndexingProvider } from "../src/context/indexing"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createSortable,
} from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { ThemeProvider } from "@stratacode/strata-ui/theme"
import { DialogProvider, useDialog } from "@stratacode/strata-ui/context/dialog"
import { Dialog } from "@stratacode/strata-ui/dialog"
import { DropdownMenu } from "@stratacode/strata-ui/dropdown-menu"
import { ContextMenu } from "@stratacode/strata-ui/context-menu"
import { MarkedProvider } from "@stratacode/strata-ui/context/marked"
import { CodeComponentProvider } from "@stratacode/strata-ui/context/code"
import { DiffComponentProvider } from "@stratacode/strata-ui/context/diff"
import { FileComponentProvider } from "@stratacode/strata-ui/context/file"
import { Code } from "@stratacode/strata-ui/code"
import { Diff } from "@stratacode/strata-ui/diff"
import { File } from "@stratacode/strata-ui/file"
import { Toast, showToast } from "@stratacode/strata-ui/toast"
import { ResizeHandle } from "@stratacode/strata-ui/resize-handle"
import { Icon } from "@stratacode/strata-ui/icon"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { Spinner } from "@stratacode/strata-ui/spinner"
import { Tooltip, TooltipKeybind } from "@stratacode/strata-ui/tooltip"
import { Popover } from "@stratacode/strata-ui/popover"
import { VSCodeProvider, useVSCode } from "../src/context/vscode"
import { ServerProvider } from "../src/context/server"
import { ProviderProvider } from "../src/context/provider"
import { ConfigProvider } from "../src/context/config"
import { NotificationsProvider } from "../src/context/notifications"
import { SessionProvider, useSession } from "../src/context/session"
import { WorktreeModeProvider } from "../src/context/worktree-mode"
import { ChatView } from "../src/components/chat"
import HistoryView from "../src/components/history/HistoryView"
import { NewWorktreeDialog } from "./NewWorktreeDialog"
import { LanguageBridge, DataBridge } from "../src/App"
import { useLanguage } from "../src/context/language"
import { formatRelativeDate } from "../src/utils/date"
import { validateLocalSession, nextSelectionAfterDelete, adjacentHint, restoreLocalSessions, LOCAL } from "./navigate"
import { reorderTabs, applyTabOrder, firstOrderedTitle } from "./tab-order"
import { createTabOrderSync } from "./tab-order-sync"
import { ConstrainDragYAxis } from "./sortable-tab"
import { isTerminalTabId, createTerminalState, createTerminalHandlers, createTerminalMessageHandler } from "./terminal"
import { renderTab, renderTerminalLayer, renderNewTabButton } from "./tab-rendering"
import { DiffPanel } from "./DiffPanel"
import { createRevertFile } from "./revert-file"
import { FullScreenDiffView } from "./FullScreenDiffView"
import { ApplyDialog } from "./ApplyDialog"
import { groupApplyConflicts } from "./apply-conflicts"
import { useApplyDialog } from "./useApplyDialog"
import { useReviewState } from "./useReviewState"
import { useSidebarState, type SidebarSelection } from "./useSidebarState"
import type { ReviewComment } from "./review-comments"
import type { ReviewThread } from "../src/types/messages"
import { BranchSelect } from "./BranchSelect"
import { WorktreeItem } from "./WorktreeItem"
import SectionHeader from "./SectionHeader"
import { randomColor } from "./section-colors"
import {
  buildTopLevelItems,
  buildSidebarOrder,
  buildShortcutMap,
  isGrouped,
  isGroupStart,
  isGroupEnd,
  type TopLevelItem,
} from "./section-helpers"
import { sectionAwareDetector } from "./section-dnd"
import { ConstrainDragXAxis } from "./constrain-drag-x"
import { mergeWorktreeDiffs } from "./diff-state"
import "./agent-manager.css"
import "./agent-manager-review.css"
const REVIEW_TAB_ID = "review"

interface SetupState {
  active: boolean
  message: string
  branch?: string
  error?: boolean
  worktreeId?: string
  errorCode?: string
}
interface WorktreeBusyState {
  reason: "setting-up" | "deleting"
  message?: string
  branch?: string
}

type SidePanel = "diff" | "pr" | null
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
const MAX_JUMP_INDEX = 9

const defaultBindings: Record<string, string> = {
  previousSession: isMac ? "⌘⌥↑" : "Ctrl+Alt+↑",
  nextSession: isMac ? "⌘⌥↓" : "Ctrl+Alt+↓",
  previousTab: isMac ? "⌘⌥←" : "Ctrl+Alt+←",
  nextTab: isMac ? "⌘⌥→" : "Ctrl+Alt+→",
  showTerminal: isMac ? "⌘/" : "Ctrl+/",
  newTerminal: isMac ? "⌘⇧T" : "Ctrl+Shift+T",
  runScript: isMac ? "⌘E" : "Ctrl+E",
  toggleDiff: isMac ? "⌘D" : "Ctrl+D",
  showShortcuts: isMac ? "⌘⇧/" : "Ctrl+Shift+/",
  newTab: isMac ? "⌘T" : "Ctrl+T",
  closeTab: isMac ? "⌘W" : "Ctrl+W",
  newWorktree: isMac ? "⌘N" : "Ctrl+N",
  advancedWorktree: isMac ? "⌘⇧N" : "Ctrl+Shift+N",
  closeWorktree: isMac ? "⌘⇧W" : "Ctrl+Shift+W",
  openWorktree: isMac ? "⌘⇧O" : "Ctrl+Shift+O",
  agentManagerOpen: isMac ? "⌘⇧M" : "Ctrl+Shift+M",
  cycleAgentMode: isMac ? "⌘." : "Ctrl+.",
  cyclePreviousAgentMode: isMac ? "⌘⇧." : "Ctrl+Shift+.",
  ...Object.fromEntries(
    Array.from({ length: MAX_JUMP_INDEX }, (_, i) => [`jumpTo${i + 1}`, isMac ? `⌘${i + 1}` : `Ctrl+${i + 1}`]),
  ),
}

/** Manages horizontal scroll for the tab list: hides the scrollbar, converts
 *  vertical wheel events to horizontal scroll, tracks overflow to show/hide
 *  fade indicators, and auto-scrolls the active tab into view. */
function useTabScroll(activeTabs: Accessor<SessionInfo[]>, activeId: Accessor<string | undefined>) {
  const [ref, setRef] = createSignal<HTMLDivElement | undefined>()
  const [showLeft, setShowLeft] = createSignal(false)
  const [showRight, setShowRight] = createSignal(false)
  let scrollFrame: number | undefined
  const update = () => {
    if (scrollFrame !== undefined) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined
      const el = ref()
      if (!el) return
      setShowLeft(el.scrollLeft > 2)
      setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    })
  }
  // Wheel → horizontal scroll conversion
  const onWheel = (e: WheelEvent) => {
    const el = ref()
    if (!el) return
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY > 0 ? 60 : -60
  }
  // Recalculate on scroll, resize, or tab changes
  createEffect(() => {
    const el = ref()
    if (!el) return
    el.addEventListener("scroll", update, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })
    onCleanup(() => {
      el.removeEventListener("scroll", update)
      el.removeEventListener("wheel", onWheel)
      ro.disconnect()
      mo.disconnect()
    })
  })
  createEffect(() => {
    const id = activeId()
    const el = ref()
    // depend on tabs length to trigger on tab add/remove
    activeTabs()
    if (!id || !el) return
    requestAnimationFrame(() => {
      const tab = el.querySelector(`[data-tab-id="${id}"]`) as HTMLElement | null
      if (!tab) return
      const left = tab.offsetLeft
      const right = left + tab.offsetWidth
      if (left < el.scrollLeft) {
        el.scrollTo({ left: left - 8, behavior: "smooth" })
      } else if (right > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: right - el.clientWidth + 8, behavior: "smooth" })
      }
    })
  })
  return { setRef, showLeft, showRight }
}
/** Shortcut category definition for the keyboard shortcuts dialog */
interface ShortcutEntry {
  label: string
  binding: string
}
interface ShortcutCategory {
  title: string
  shortcuts: ShortcutEntry[]
}
/** Build the categorized list of keyboard shortcuts from the current bindings */
function buildShortcutCategories(
  bindings: Record<string, string>,
  t: (key: string, params?: Record<string, string | number>) => string,
): ShortcutCategory[] {
  return [
    {
      title: t("agentManager.shortcuts.category.quickSwitch"),
      shortcuts: [
        {
          label: t("agentManager.shortcuts.jumpToItem"),
          binding: (() => {
            const first = bindings.jumpTo1 ?? ""
            const prefix = first.replace(/\d+$/, "")
            return prefix ? `${prefix}1-9` : ""
          })(),
        },
      ],
    },
    {
      title: t("agentManager.shortcuts.category.sidebar"),
      shortcuts: [
        { label: t("agentManager.shortcuts.previousItem"), binding: bindings.previousSession ?? "" },
        { label: t("agentManager.shortcuts.nextItem"), binding: bindings.nextSession ?? "" },
        { label: t("agentManager.shortcuts.newWorktree"), binding: bindings.newWorktree ?? "" },
        { label: t("agentManager.shortcuts.advancedWorktree"), binding: bindings.advancedWorktree ?? "" },
        { label: t("agentManager.shortcuts.deleteWorktree"), binding: bindings.closeWorktree ?? "" },
        { label: t("agentManager.shortcuts.openWorktree"), binding: bindings.openWorktree ?? "" },
      ],
    },
    {
      title: t("agentManager.shortcuts.category.tabs"),
      shortcuts: [
        { label: t("agentManager.shortcuts.previousTab"), binding: bindings.previousTab ?? "" },
        { label: t("agentManager.shortcuts.nextTab"), binding: bindings.nextTab ?? "" },
        { label: t("agentManager.shortcuts.newTab"), binding: bindings.newTab ?? "" },
        { label: t("agentManager.shortcuts.closeTab"), binding: bindings.closeTab ?? "" },
      ],
    },
    {
      title: t("agentManager.shortcuts.category.terminal"),
      shortcuts: [
        { label: t("agentManager.shortcuts.toggleTerminal"), binding: bindings.showTerminal ?? "" },
        { label: t("agentManager.shortcuts.runScript"), binding: bindings.runScript ?? "" },
        { label: t("agentManager.shortcuts.toggleDiff"), binding: bindings.toggleDiff ?? "" },
      ],
    },
    {
      title: t("agentManager.shortcuts.category.global"),
      shortcuts: [
        { label: t("agentManager.shortcuts.openAgentManager"), binding: bindings.agentManagerOpen ?? "" },
        { label: t("agentManager.shortcuts.cycleAgentMode"), binding: bindings.cycleAgentMode ?? "" },
        { label: t("agentManager.shortcuts.cyclePreviousAgentMode"), binding: bindings.cyclePreviousAgentMode ?? "" },
        { label: t("agentManager.shortcuts.showShortcuts"), binding: bindings.showShortcuts ?? "" },
      ].filter((s) => s.binding),
    },
  ].filter((c) => c.shortcuts.length > 0)
}

import { parseBindingTokens } from "./keybind-tokens"
import { WebviewLogger } from "../src/utils/webview-logger"

const AgentManagerContent: Component = () => {
  const { t } = useLanguage()
  const session = useSession()
  const vscode = useVSCode()
  const dialog = useDialog()

  const [kb, setKb] = createSignal<Record<string, string>>(defaultBindings)
  const [setup, setSetup] = createSignal<SetupState>({ active: false, message: "" })
  const [worktrees, setWorktrees] = createSignal<WorktreeState[]>([])
  const [managedSessions, setManagedSessions] = createSignal<ManagedSessionState[]>([])
  const [repoBranch, setRepoBranch] = createSignal<string | undefined>()
  const [busyWorktrees, setBusyWorktrees] = createSignal<Map<string, WorktreeBusyState>>(new Map())
  const [staleWorktreeIds, setStaleWorktreeIds] = createSignal<Set<string>>(new Set())
  const [worktreesLoaded, setWorktreesLoaded] = createSignal(false)
  const [sessionsLoaded, setSessionsLoaded] = createSignal(false)
  const [isGitRepo, setIsGitRepo] = createSignal(true)
  const [repoDetectedBranch, setRepoDetectedBranch] = createSignal<string | undefined>()
  const [defaultBaseBranch, setDefaultBaseBranch] = createSignal<string | undefined>()
  const repoDefaultBranch = () => defaultBaseBranch() ?? repoDetectedBranch() ?? "main"
  const hasConfiguredBranch = () => !!defaultBaseBranch()
  const DEFAULT_SIDEBAR_WIDTH = 260
  const MIN_SIDEBAR_WIDTH = 200
  const MAX_SIDEBAR_WIDTH_RATIO = 0.4

  // Recover persisted local session IDs from webview state
  const persisted = vscode.getState<{ localSessionIDs?: string[]; sidebarWidth?: number }>()
  const [localSessionIDs, setLocalSessionIDs] = createSignal<string[]>(persisted?.localSessionIDs ?? [])
  
  // Lazy ref to avoid temporal dependency (assigned after memos are created)
  let getVisibleTabId: () => string | undefined = () => undefined

  /** Remove a session ID from the local tab (no-op if absent). */
  const evictLocal = (sid: string) =>
    setLocalSessionIDs((prev) => (prev.includes(sid) ? prev.filter((id) => id !== sid) : prev))
  const {
    selection,
    setSelection,
    sidebarWidth,
    setSidebarWidth,
    sessionsCollapsed,
    setSessionsCollapsed,
    sections,
    setSections,
    history,
    setHistory,
    tabMemory,
    setTabMemory,
    saveTabMemory,
    sidebarWorktreeOrder,
    setSidebarWorktreeOrder,
    renamingSection,
    setRenamingSection,
    draggingWorktree,
    setDraggingWorktree,
  } = useSidebarState({
    persistedWidth: persisted?.sidebarWidth,
    defaultWidth: DEFAULT_SIDEBAR_WIDTH,
    visibleTabId: () => getVisibleTabId(),
  })
  
  // rAF coalescing for resize handlers — at most one signal write per frame
  let sidebarRaf: number | undefined
  let pendingSidebarWidth: number | undefined
  let diffRaf: number | undefined
  let pendingDiffWidth: number | undefined
  const [sidePanel, setSidePanel] = createSignal<SidePanel>(null)
  const diffOpen = () => sidePanel() === "diff"
  const [diffDatas, setDiffDatas] = createSignal<Record<string, WorktreeFileDiff[]>>({})
  const [diffLoading, setDiffLoading] = createSignal(false)
  const [diffFileLoading, setDiffFileLoading] = createSignal<Record<string, Record<string, true>>>({})
  const [diffWidth, setDiffWidth] = createSignal(Math.round(window.innerWidth * 0.5))

  // Full-screen review state (in-memory, per sidebar context: local/worktree)
  const [reviewActive, setReviewActive] = createSignal(false)
  const [reviewDiffStyle, setReviewDiffStyle] = createSignal<"unified" | "split">("unified")
  const [eagerLoad, setEagerLoad] = createSignal(false)
  const [instantComments, setInstantComments] = createSignal(true)
  const [reviewSummary, setReviewSummary] = createSignal<string>()
  const [explainingDiffs, setExplainingDiffs] = createSignal(false)
  const [reviewThreads, setReviewThreads] = createSignal<ReviewThread[]>([])
  // reviewOpen (memo below) controls tab presence for selected context.

  // Per-worktree git stats (diff additions/deletions, commits missing from origin)
  const [worktreeStats, setWorktreeStats] = createSignal<Record<string, WorktreeGitStats>>({})

  // Per-worktree PR status data
  const [prStatuses, setPrStatuses] = createSignal<Record<string, PRStatus | null>>({})

  const [runStatuses, setRunStatuses] = createSignal<Record<string, RunStatus>>({})
  const [runScriptConfigured, setRunScriptConfigured] = createSignal(false)

  // Local repo git stats (branch name, diff additions/deletions, commits)
  const [localStats, setLocalStats] = createSignal<LocalGitStats | undefined>()

  const {
    openApplyDialog,
    closeApplyDialog,
    resolveWorktreeSessionId,
    applyTarget,
    applyStateForSelection,
  } = useApplyDialog({
    vscode,
    t,
    dialog,
    selection,
    managedSessions,
    diffDatas,
    diffLoading,
    worktrees,
  })

  const {
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
  } = useReviewState({
    selection,
    setSidePanel,
    REVIEW_TAB_ID,
    reviewActive,
    setReviewActive,
    diffDatas,
    managedSessions,
    session,
    worktrees,
  })

  // Pending local tab counter for generating unique IDs
  let pendingCounter = 0
  const PENDING_PREFIX = "pending:"
  const [activePendingId, setActivePendingId] = createSignal<string | undefined>()

  // Per-sidebar-context terminal state. `terms.activeId` holds the id
  // of the focused terminal tab, if any — takes precedence over
  // session/pending/review when deriving the visible tab.
  const terms = createTerminalState(selection)

  // Inline delete confirmation: tracks which worktree is awaiting a second click/press
  const [pendingDelete, setPendingDelete] = createSignal<string | null>(null)
  let pendingDeleteTimer: ReturnType<typeof setTimeout> | undefined
  const cancelPendingDelete = () => {
    clearTimeout(pendingDeleteTimer)
    setPendingDelete(null)
  }
  createEffect(on(selection, () => cancelPendingDelete(), { defer: true }))
  onCleanup(() => clearTimeout(pendingDeleteTimer))

  const openWorktreeDirectory = () => {
    const sel = selection()
    if (!sel || sel === LOCAL) return
    vscode.postMessage({ type: "agentManager.openWorktree", worktreeId: sel })
  }

  const runWorktree = (id: string) => {
    const state = runStatuses()[id]?.state ?? "idle"
    if (state === "running" || state === "stopping") {
      vscode.postMessage({ type: "agentManager.stopRunScript", worktreeId: id })
      return
    }
    vscode.postMessage({ type: "agentManager.runScript", worktreeId: id })
  }

  const configureRunScript = () => vscode.postMessage({ type: "agentManager.configureRunScript" })

  const runSelected = () => {
    const sel = selection()
    if (sel) runWorktree(sel)
  }



  const isPending = (id: string) => id.startsWith(PENDING_PREFIX)

  // Drag-and-drop state for tab reordering
  const [draggingTab, setDraggingTab] = createSignal<string | undefined>()
  // Tab ordering: context key → ordered session ID array (recovered from extension state)
  const [worktreeTabOrder, setWorktreeTabOrder] = createSignal<Record<string, string[]>>({})
  // Sidebar worktree order (persisted to extension state)
  let pendingNewSection = false

  // Pin new tabs at the tail (see tab-order-sync); strip ephemeral ids so agent-manager.json stays clean.
  const persistTabOrder = (key: string, order: string[]) => {
    const durable = order.filter((id) => id !== REVIEW_TAB_ID && !isTerminalTabId(id))
    vscode.postMessage({ type: "agentManager.setTabOrder", key, order: durable })
  }
  const tabOrderSync = createTabOrderSync({
    LOCAL,
    REVIEW_TAB_ID,
    order: worktreeTabOrder,
    setOrder: setWorktreeTabOrder,
    persist: persistTabOrder,
    localSessionIDs,
    sessions: session.sessions,
    managedSessions,
    reviewOpenByContext,
    terminalIdsFor: (key) => terms.forSelection(key).map((t) => t.id),
  })
  const appendToTabOrder = tabOrderSync.append

  const addPendingTab = () => {
    const id = `${PENDING_PREFIX}${++pendingCounter}`
    setLocalSessionIDs((prev) => [...prev, id])
    appendToTabOrder(LOCAL, id)
    // Deactivate any focused terminal so the new pending session is
    // actually visible — visibleTabId prioritises terms.activeId().
    terms.setActiveId(undefined)
    setActivePendingId(id)
    session.clearCurrentSession()
    return id
  }

  // Persist local session IDs and sidebar width to webview state for recovery (exclude pending tabs).
  // Debounced to avoid serializing state on every pixel during resize drag.
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    // Read signals eagerly so Solid tracks them as dependencies
    const ids = localSessionIDs().filter((id) => !isPending(id))
    const width = sidebarWidth()
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const prev = vscode.getState<Record<string, unknown>>() ?? {}
      vscode.setState({ ...prev, localSessionIDs: ids, sidebarWidth: width })
    }, 300)
  })
  onCleanup(() => clearTimeout(persistTimer))

  // Invalidate local session IDs if they no longer exist (preserve pending tabs)
  createEffect(() => {
    const all = session.sessions()
    if (all.length === 0) return // sessions not loaded yet
    const ids = all.map((s) => s.id)
    const prev = localSessionIDs()
    const valid = prev.filter((lid) => isPending(lid) || validateLocalSession(lid, ids))
    if (valid.length !== prev.length) {
      const removed = prev.filter((lid) => !isPending(lid) && !valid.includes(lid))
      for (const id of removed) vscode.postMessage({ type: "agentManager.forgetSession", sessionId: id })
      setLocalSessionIDs(valid)
    }
  })

  const worktreeSessionIds = createMemo(
    () =>
      new Set(
        managedSessions()
          .filter((ms) => ms.worktreeId)
          .map((ms) => ms.id),
      ),
  )

  const localSet = createMemo(() => new Set(localSessionIDs()))

  // Sessions NOT in any worktree and not local
  const unassignedSessions = createMemo(() =>
    [...session.sessions()]
      .filter((s) => !worktreeSessionIds().has(s.id) && !localSet().has(s.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  )

  // Local sessions (resolved from session list + pending tabs, in insertion order)
  const localSessions = createMemo((): SessionInfo[] => {
    const ids = localSessionIDs()
    const all = session.sessions()
    const lookup = new Map(all.map((s) => [s.id, s]))
    const result: SessionInfo[] = []
    const now = new Date().toISOString()
    for (const id of ids) {
      const real = lookup.get(id)
      if (real) {
        result.push(real)
      } else if (isPending(id)) {
        result.push({ id, title: t("agentManager.session.newSession"), createdAt: now, updatedAt: now })
      }
    }
    return result
  })

  // Oldest-first sort before applyTabOrder — worktree label and tab bar must agree on "first session".
  const sessionsForWorktree = (worktreeId: string): SessionInfo[] => {
    const ids = new Set(
      managedSessions()
        .filter((ms) => ms.worktreeId === worktreeId)
        .map((ms) => ms.id),
    )
    return applyTabOrder(
      session
        .sessions()
        .filter((s) => ids.has(s.id))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      worktreeTabOrder()[worktreeId],
    )
  }

  const activeWorktreeSessions = createMemo((): SessionInfo[] => {
    const sel = selection()
    if (!sel || sel === LOCAL) return []
    return sessionsForWorktree(sel)
  })

  const activeTabs = createMemo((): SessionInfo[] => {
    const sel = selection()
    if (sel === LOCAL) return localSessions()
    if (sel) return activeWorktreeSessions()
    return []
  })

  const contextEmpty = createMemo(() => {
    const sel = selection()
    if (terms.current().length > 0) return false
    if (sel === LOCAL) return localSessionIDs().length === 0
    if (sel) return activeWorktreeSessions().length === 0 && managedSessions().every((ms) => ms.worktreeId !== sel)
    return false
  })

  createEffect(() => {
    const sel = selection()
    if (sel === null) {
      if (reviewActive()) setReviewActive(false)
      return
    }
    if (reviewActive() && !reviewOpen()) {
      setReviewActive(false)
    }
  })

  createEffect(() => {
    const id = selection() ?? session.currentSessionID()
    if (!id) return
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-sidebar-id="${id}"]`)
      if (el instanceof HTMLElement) scrollIntoView(el)
    })
  })

  const readOnly = createMemo(() => selection() === null && !!session.currentSessionID())

  const visibleTabId = createMemo(() => {
    const term = terms.activeId()
    if (term) return term
    if (reviewActive()) return REVIEW_TAB_ID
    return session.currentSessionID() ?? activePendingId()
  })
  getVisibleTabId = visibleTabId // Assign lazy ref for useSidebarState
  const tabScroll = useTabScroll(activeTabs, visibleTabId)

  const worktreeLabel = (wt: WorktreeState): string => {
    if (wt.label) return wt.label
    return firstOrderedTitle(sessionsForWorktree(wt.id), worktreeTabOrder()[wt.id], wt.branch)
  }

  const worktreeSubtitle = (wt: WorktreeState): string | undefined => {
    const label = worktreeLabel(wt)
    return label !== wt.branch ? wt.branch : undefined
  }

  const isStaleWorktree = (worktreeId: string): boolean => staleWorktreeIds().has(worktreeId)

  const isAnySessionBusy = (ids: string[]): boolean => {
    if (ids.length === 0) return false
    const statuses = session.allStatusMap()
    const perms = session.permissions()
    const qs = session.questions()
    for (const id of ids) {
      const info = statuses[id]
      if (!info || info.type === "idle") continue
      const blocked = perms.some((p) => p.sessionID === id) || qs.some((q) => q.sessionID === id)
      if (!blocked) return true
    }
    return false
  }

  /** True when an agent session assigned to this worktree is actively working. */
  const isAgentBusy = (worktreeId: string): boolean => {
    const ids = managedSessions()
      .filter((ms) => ms.worktreeId === worktreeId)
      .map((ms) => ms.id)
    return isAnySessionBusy(ids)
  }

  /** True when a local session is actively working. */
  const isLocalBusy = (): boolean => isAnySessionBusy(localSessionIDs())

  /** Worktrees sorted so that grouped items are always adjacent, respecting custom order if set. */
  const sortedWorktrees = createMemo(() => {
    const ordered = applyTabOrder(worktrees(), sidebarWorktreeOrder())
    if (ordered.length === 0) return []

    // Collect grouped worktrees by groupId
    const grouped = new Map<string, WorktreeState[]>()
    for (const wt of ordered) {
      if (!wt.groupId) continue
      const list = grouped.get(wt.groupId) ?? []
      list.push(wt)
      grouped.set(wt.groupId, list)
    }

    // Build output: interleave groups at the position of their earliest member
    const result: WorktreeState[] = []
    const placed = new Set<string>()
    for (const wt of ordered) {
      if (placed.has(wt.id)) continue
      if (wt.groupId) {
        if (placed.has(wt.groupId)) continue
        placed.add(wt.groupId)
        const group = grouped.get(wt.groupId) ?? []
        for (const g of group) {
          result.push(g)
          placed.add(g.id)
        }
      } else {
        result.push(wt)
        placed.add(wt.id)
      }
    }
    return result
  })

  const worktreesInSection = (id: string) => sortedWorktrees().filter((wt) => wt.sectionId === id)
  const ungrouped = createMemo(() => sortedWorktrees().filter((wt) => !wt.sectionId))
  const topLevelItems = createMemo((): TopLevelItem[] =>
    buildTopLevelItems(sections(), ungrouped(), sortedWorktrees(), sidebarWorktreeOrder()),
  )

  /** Flat visual order of all visible sidebar items — used for navigation and shortcut assignment. */
  const sidebarOrder = createMemo(() =>
    buildSidebarOrder(topLevelItems(), sortedWorktrees(), sections(), worktreesInSection, unassignedSessions()),
  )
  /** Map from sidebar item id → 1-based shortcut number (⌘1 for LOCAL, ⌘2 for first worktree, etc.) */
  const shortcutMap = createMemo(() => buildShortcutMap(sidebarOrder()))

  const moveToSection = (ids: string[], sec: string | null) =>
    vscode.postMessage({ type: "agentManager.moveToSection", worktreeIds: ids, sectionId: sec })
  const moveSection = (sectionId: string, dir: -1 | 1) =>
    vscode.postMessage({ type: "agentManager.moveSection", sectionId, dir })
  const newSection = (ids?: string[]) => {
    pendingNewSection = true
    vscode.postMessage({
      type: "agentManager.createSection",
      name: t("agentManager.section.defaultName"),
      color: randomColor(),
      worktreeIds: ids,
    })
  }

  const scrollIntoView = (el: HTMLElement) => el.scrollIntoView({ block: "nearest", behavior: "smooth" })

  const focusSidebarItem = (item: { type: string; id: string }) => {
    if (item.type === "local") selectLocal()
    else if (item.type === "wt") selectWorktree(item.id)
    else {
      saveTabMemory()
      setSelection(null)
      setReviewActive(false)
      session.selectSession(item.id)
    }
    const el = document.querySelector(`[data-sidebar-id="${item.id}"]`)
    if (el instanceof HTMLElement) scrollIntoView(el)
  }

  // Navigate sidebar items with arrow keys (uses visual order from sidebarOrder)
  const navigate = (direction: "up" | "down") => {
    const flat = sidebarOrder()
    if (flat.length === 0) return
    const current = selection() ?? session.currentSessionID()
    const idx = current ? flat.findIndex((f) => f.id === current) : -1
    const next = direction === "up" ? idx - 1 : idx + 1
    if (next < 0 || next >= flat.length) return
    focusSidebarItem(flat[next]!)
  }

  // Jump to sidebar item by 0-based index into sidebarOrder (⌘1 = index 0 = LOCAL, ⌘2 = index 1, etc.)
  const jumpToItem = (index: number) => {
    const item = sidebarOrder()[index]
    if (item) focusSidebarItem(item)
  }

  // Navigate tabs with Cmd+Alt+Left/Right
  const navigateTab = (direction: "left" | "right") => {
    const ids = tabIds()
    if (ids.length === 0) return
    const idx = ids.indexOf(visibleTabId() ?? "")
    if (idx === -1) return
    const next = direction === "left" ? idx - 1 : idx + 1
    if (next < 0 || next >= ids.length) return
    const targetId = ids[next]!
    if (isTerminalTabId(targetId)) return termHandlers.activate(targetId)
    terms.setActiveId(undefined)
    if (targetId === REVIEW_TAB_ID) {
      if (!reviewOpen()) setReviewOpenForSelection(true)
      setReviewActive(true)
      return
    }
    const target = tabLookup().get(targetId)
    if (!target) return
    setReviewActive(false)
    if (isPending(target.id)) {
      setActivePendingId(target.id)
      session.clearCurrentSession()
      return
    }
    setActivePendingId(undefined)
    session.selectSession(target.id)
  }

  const selectLocal = () => {
    saveTabMemory()
    setReviewActive(false)
    setSelection(LOCAL)
    vscode.postMessage({ type: "agentManager.requestRepoInfo" })
    const locals = localSessions()
    const remembered = tabMemory()[LOCAL]
    if (terms.hasRemembered(LOCAL, remembered)) return termHandlers.activate(remembered!)
    terms.setActiveId(undefined)
    const target = remembered ? locals.find((s) => s.id === remembered) : undefined
    const fallback = target ?? locals[0]
    if (fallback && !isPending(fallback.id)) {
      setActivePendingId(undefined)
      session.selectSession(fallback.id)
    } else {
      setActivePendingId(fallback && isPending(fallback.id) ? fallback.id : undefined)
      session.clearCurrentSession()
      vscode.postMessage({ type: "agentManager.showExistingLocalTerminal" })
    }
    setReviewActive(remembered === REVIEW_TAB_ID && reviewOpenByContext()[LOCAL] === true)
  }

  const selectWorktree = (worktreeId: string) => {
    saveTabMemory()
    setSelection(worktreeId)
    const remembered = tabMemory()[worktreeId]
    if (terms.hasRemembered(worktreeId, remembered)) return termHandlers.activate(remembered!)
    terms.setActiveId(undefined)
    // Try rich session list first, fall back to managed session IDs when
    // session.sessions() hasn't been populated yet for this worktree.
    const rich = sessionsForWorktree(worktreeId)
    const managed = managedSessions().filter((ms) => ms.worktreeId === worktreeId)
    const target = remembered
      ? (rich.find((s) => s.id === remembered) ?? managed.find((ms) => ms.id === remembered))
      : undefined
    const fallback = target ?? rich[0] ?? managed[0]
    if (fallback) session.selectSession(fallback.id)
    else session.setCurrentSessionID(undefined)
    setReviewActive(remembered === REVIEW_TAB_ID && reviewOpenByContext()[worktreeId] === true)
  }

  const cycleAgent = (direction: 1 | -1) => {
    const available = session.agents().filter((a) => a.mode !== "subagent" && !a.hidden)
    if (available.length <= 1) return
    const current = session.selectedAgent()
    const idx = available.findIndex((a) => a.name === current)
    const raw = idx + direction
    const next = raw < 0 ? available.length - 1 : raw >= available.length ? 0 : raw
    const agent = available[next]
    if (agent) session.selectAgent(agent.name)
  }

  const syncRunStatuses = (items: RunStatus[] = []) => {
    const map: Record<string, RunStatus> = {}
    for (const item of items) map[item.worktreeId] = item
    setRunStatuses(map)
  }

  onMount(() => {
    // DEBUG: raw message listener to trace ALL messages arriving at the Agent Manager webview
    window.addEventListener("message", (ev) => {
      const d = ev.data
      if (d?.type === "settingLoaded" || d?.type === "requestSetting") {
        console.log("[AM:RAW] window message:", d.type, d)
      }
    })
    const actionHandlers: Record<string, () => void> = {
      sessionPrevious: () => navigate("up"),
      sessionNext: () => navigate("down"),
      tabPrevious: () => navigateTab("left"),
      tabNext: () => navigateTab("right"),
      showTerminal: () => {
        const id = session.currentSessionID()
        if (id) vscode.postMessage({ type: "agentManager.showTerminal", sessionId: id })
        else if (selection() === LOCAL) vscode.postMessage({ type: "agentManager.showLocalTerminal" })
      },
      toggleDiff: () => {
        if (reviewActive()) {
          closeReviewTab()
          setSidePanel("diff")
        } else setSidePanel((prev) => (prev === "diff" ? null : "diff"))
      },
      newTab: () => handleNewTabForCurrentSelection(),
      closeTab: () => closeActiveTab(),
      newWorktree: () => handleNewWorktreeOrPromote(),
      openWorktree: () => openWorktreeDirectory(),
      runScript: () => runSelected(),
      advancedWorktree: () => showAdvancedWorktreeDialog(),
      closeWorktree: () => closeSelectedWorktree(),
      showShortcuts: () => handleShowKeyboardShortcuts(),
      focusInput: () => window.dispatchEvent(new Event("focusPrompt")),
      newTerminal: () => termHandlers.requestNew(),
      cycleAgentMode: () => { if (document.hasFocus()) cycleAgent(1) },
      cyclePreviousAgentMode: () => { if (document.hasFocus()) cycleAgent(-1) }
    }

    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (msg?.type === "navigate" && msg.view === "history") return setHistory(true)
      if (msg?.type !== "action" || !msg.action) return
      
      const actionFn = actionHandlers[msg.action]
      if (actionFn) return actionFn()
      
      const match = /^jumpTo([1-9])$/.exec(msg.action)
      if (match) jumpToItem(parseInt(match[1]!) - 1)
    }
    window.addEventListener("message", handler)

    // Prevent Cmd/Ctrl shortcuts from triggering native browser actions
    const preventDefaults = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      // Arrow navigation requires Alt modifier (Cmd+Alt+Arrow for tabs/sessions)
      if (e.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault()
      }
      // Prevent browser defaults for our shortcuts (new tab, close tab, new window, toggle diff, run, find)
      if (["t", "w", "n", "d", "e", "f"].includes(e.key.toLowerCase()) && !e.shiftKey) {
        e.preventDefault()
      }
      // Prevent defaults for shift variants (close worktree, advanced/new open worktree)
      if (["w", "n", "o"].includes(e.key.toLowerCase()) && e.shiftKey) {
        e.preventDefault()
      }
      // Prevent browser defaults for shortcuts help (Cmd/Ctrl+Shift+/)
      if (["/", "?"].includes(e.key) && e.shiftKey) {
        e.preventDefault()
      }
      // Prevent defaults for jump-to shortcuts (Cmd/Ctrl+1-9)
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
      }
    }
    window.addEventListener("keydown", preventDefaults, true)

    // Delete/Backspace on a selected worktree triggers inline delete confirmation.
    // Pressing the key twice in a row (within the 2500ms window) confirms the delete.
    const deleteKeyHandler = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      const sel = selection()
      if (!sel || sel === LOCAL) return
      e.preventDefault()
      confirmDeleteWorktree(sel)
    }
    window.addEventListener("keydown", deleteKeyHandler)

    // When the panel regains focus (e.g. returning from terminal), focus the prompt
    // and clear any stale body styles left by Kobalte modal overlays (dropdowns/dialogs
    // set pointer-events:none and overflow:hidden on body, but cleanup never runs if
    // focus leaves the webview before the overlay closes).
    const onWindowFocus = () => {
      document.body.style.pointerEvents = ""
      document.body.style.overflow = ""
      window.dispatchEvent(new Event("focusPrompt"))
    }
    window.addEventListener("focus", onWindowFocus)

    // Add created sessions as local tabs (both direct from the prompt and
    // backend follow-ups). Dedups HTTP + SSE firing together.
    const unsubCreate = vscode.onMessage((msg) => {
      if (msg.type !== "sessionCreated") return
      const created = msg as { type: string; session: { id: string } }
      if (localSessionIDs().includes(created.session.id)) return
      if (worktreeSessionIds().has(created.session.id)) return
      const pending = selection() === LOCAL ? activePendingId() : undefined
      if (pending) {
        setLocalSessionIDs((prev) => prev.map((id) => (id === pending ? created.session.id : id)))
        tabOrderSync.replaceOrAppend(LOCAL, pending, created.session.id)
        setActivePendingId(undefined)
      } else {
        saveTabMemory()
        setLocalSessionIDs((prev) => [...prev, created.session.id])
        tabOrderSync.append(LOCAL, created.session.id)
        setSelection(LOCAL)
      }
      vscode.postMessage({ type: "agentManager.persistSession", sessionId: created.session.id })
      session.selectSession(created.session.id)
    })

    // Mark sessions loaded as soon as the session context receives data (even if empty)
    const unsubSessions = vscode.onMessage((msg) => {
      if (msg.type === "sessionsLoaded" && !sessionsLoaded()) setSessionsLoaded(true)
    })

    const unsubRun = vscode.onMessage((msg) => {
      if (msg.type !== "agentManager.runStatus") return
      const ev = msg as RunStatus
      setRunStatuses((prev) => ({ ...prev, [ev.worktreeId]: ev }))
    })

    // Terminal messages have their own subscription to keep main-handler complexity in check.
    const terminalDispatch = createTerminalMessageHandler({
      state: terms,
      activate: termHandlers.activate,
      saveTabMemory,
      setSelection,
      showError: (message) =>
        showToast({ variant: "error", title: t("agentManager.terminal.errorTitle"), description: message }),
      onCreated: (contextKey, terminalId) => appendToTabOrder(contextKey, terminalId),
    })
    const unsubTerminals = vscode.onMessage((msg) => {
      terminalDispatch(msg as unknown as { type: string } & Record<string, unknown>)
    })

    const syncAgentManagerStateCore = (state: AgentManagerStateMessage) => {
      setWorktrees(state.worktrees)
      setManagedSessions(state.sessions)
      setStaleWorktreeIds(new Set(state.staleWorktreeIds ?? []))
      if (state.isGitRepo !== undefined) setIsGitRepo(state.isGitRepo)
      if (!worktreesLoaded()) setWorktreesLoaded(true)
      if (state.isGitRepo === false && !sessionsLoaded()) setSessionsLoaded(true)
    }

    const syncAgentManagerStateUI = (state: AgentManagerStateMessage) => {
      const prev = new Set(sections().map((s) => s.id))
      const incoming = state.sections ?? []
      setSections(incoming)
      if (pendingNewSection) {
        pendingNewSection = false
        const c = incoming.find((s) => !prev.has(s.id))
        if (c) setRenamingSection(c.id)
      }
      if (state.tabOrder) setWorktreeTabOrder(state.tabOrder)
      if (state.worktreeOrder) setSidebarWorktreeOrder(state.worktreeOrder)
      if (state.reviewDiffStyle === "split" || state.reviewDiffStyle === "unified") {
        setReviewDiffStyle(state.reviewDiffStyle)
      }
      if ("defaultBaseBranch" in state) setDefaultBaseBranch(state.defaultBaseBranch || undefined)
      setRunScriptConfigured(state.runScriptConfigured === true)
      syncRunStatuses(state.runStatuses)
      if (state.sessionsCollapsed !== undefined) setSessionsCollapsed(state.sessionsCollapsed)
    }

    const worktreeHandlers: Record<string, (msg: any) => void> = {
      "agentManager.repoInfo": (msg: AgentManagerRepoInfoMessage) => {
        setRepoBranch(msg.branch)
        if (msg.defaultBranch) setRepoDetectedBranch(msg.defaultBranch)
      },
      "agentManager.worktreeSetup": (ev: AgentManagerWorktreeSetupMessage) => {
        if (ev.status === "ready" || ev.status === "error") {
          const error = ev.status === "error"
          if (ev.worktreeId) setBusyWorktrees((prev) => new Map([...prev].filter(([k]) => k !== ev.worktreeId)))
          setSetup({
            active: true,
            message: ev.message,
            branch: ev.branch,
            error,
            worktreeId: ev.worktreeId,
            errorCode: ev.errorCode,
          })
          globalThis.setTimeout(() => setSetup({ active: false, message: "" }), error ? 3000 : 500)
          if (!error && ev.sessionId) {
            session.selectSession(ev.sessionId)
            const ms = managedSessions().find((s) => s.id === ev.sessionId)
            if (ms?.worktreeId) setSelection(ms.worktreeId)
            evictLocal(ev.sessionId)
            // Mark grouped worktrees as loading when ready
            const wt = ms?.worktreeId ? worktrees().find((w) => w.id === ms.worktreeId) : undefined
            if (wt?.groupId) {
              setBusyWorktrees((prev) => new Map([...prev, [wt.id, { reason: "setting-up" as const }]]))
            }
          }
        } else {
          // Track this worktree as setting up and auto-select it in the sidebar
          if (ev.worktreeId) {
            setBusyWorktrees(
              (prev) =>
                new Map([...prev, [ev.worktreeId!, { reason: "setting-up", message: ev.message, branch: ev.branch }]]),
            )
            setSelection(ev.worktreeId)
          }
          // Close diff/review panels — nothing to show during setup
          setSidePanel(null)
          setReviewActive(false)
          setSetup({ active: true, message: ev.message, branch: ev.branch, worktreeId: ev.worktreeId })
        }
      },
      "agentManager.sessionAdded": (ev: { type: string; sessionId: string; worktreeId: string }) => {
        saveTabMemory()
        appendToTabOrder(ev.worktreeId, ev.sessionId)
        setSelection(ev.worktreeId)
        session.selectSession(ev.sessionId)
      },
      "agentManager.sessionForked": (ev: { type: string; sessionId: string; forkedFromId: string; worktreeId?: string }) => {
        tabOrderSync.insertAfter(ev.worktreeId, ev.forkedFromId, ev.sessionId)
        if (!ev.worktreeId) {
          // Local session: insert new tab after the forked-from tab
          setLocalSessionIDs((prev) => {
            const idx = prev.indexOf(ev.forkedFromId)
            if (idx >= 0) return [...prev.slice(0, idx + 1), ev.sessionId, ...prev.slice(idx + 1)]
            return [...prev, ev.sessionId]
          })
          vscode.postMessage({ type: "agentManager.persistSession", sessionId: ev.sessionId })
        } else {
          saveTabMemory()
          setSelection(ev.worktreeId)
          evictLocal(ev.sessionId)
        }
        session.selectSession(ev.sessionId)
      },
      "agentManager.keybindings": (ev: AgentManagerKeybindingsMessage) => setKb(ev.bindings),
      "agentManager.state": (state: AgentManagerStateMessage) => {
        syncAgentManagerStateCore(state)
        syncAgentManagerStateUI(state)

        const current = session.currentSessionID()
        if (current) {
          const ms = state.sessions.find((s) => s.id === current)
          if (ms?.worktreeId) setSelection(ms.worktreeId)
        }
        
        // Restore local session IDs from persisted state (sessions with no worktreeId)
        const restored = restoreLocalSessions(
          state.sessions,
          localSessionIDs(),
          state.tabOrder?.[LOCAL],
          isPending,
          applyTabOrder,
        )
        if (restored) setLocalSessionIDs(restored)

        // Clear busy state for worktrees that have been removed
        const ids = new Set(state.worktrees.map((wt) => wt.id))
        setBusyWorktrees((prevBusy) => {
          const next = new Map([...prevBusy].filter(([id]) => ids.has(id)))
          return next.size === prevBusy.size ? prevBusy : next
        })
        setRunStatuses((prevStatus) =>
          Object.fromEntries(Object.entries(prevStatus).filter(([id]) => id === "local" || ids.has(id))),
        )
      },
      "agentManager.multiVersionProgress": (ev: AgentManagerMultiVersionProgressMessage) => {
        if (ev.status === "done" && ev.groupId) {
          setBusyWorktrees((prevMap) => {
            const next = new Map(prevMap)
            for (const wt of worktrees()) {
              if (wt.groupId === ev.groupId) next.delete(wt.id)
            }
            return next
          })
        }
      },
      "agentManager.setSessionModel": (ev: { type: string; sessionId: string; providerID: string; modelID: string }) => {
        session.setSessionModel(ev.sessionId, ev.providerID, ev.modelID)
      },
      "agentManager.sendInitialMessage": (ev: AgentManagerSendInitialMessage) => {
        if (ev.agent) {
          session.setSessionAgent(ev.sessionId, ev.agent)
        }
        if (ev.providerID && ev.modelID) {
          session.setSessionModel(ev.sessionId, ev.providerID, ev.modelID)
        }
        if (ev.text) {
          vscode.postMessage({
            type: "sendMessage",
            text: ev.text,
            sessionID: ev.sessionId,
            providerID: ev.providerID,
            modelID: ev.modelID,
            agent: ev.agent,
            files: ev.files,
          })
        }
        if (ev.worktreeId) {
          setBusyWorktrees((prevBusy) => {
            const next = new Map(prevBusy)
            next.delete(ev.worktreeId!)
            return next
          })
        }
      },
      "agentManager.worktreeDiff": (ev: AgentManagerWorktreeDiffMessage) => {
        let staleFiles: Set<string> | undefined
        setDiffDatas((prev) => {
          const existing = prev[ev.sessionId]
          const merged = existing
            ? mergeWorktreeDiffs(existing, ev.diffs)
            : { diffs: ev.diffs, stale: new Set<string>() }
          staleFiles = merged.stale
          const next = merged.diffs
          if (existing && existing.length === next.length && existing.every((old, i) => old === next[i])) return prev
          return { ...prev, [ev.sessionId]: next }
        })
        if (staleFiles) refreshStaleDiffs(ev.sessionId, staleFiles)
      },
      "agentManager.worktreeDiffFile": (ev: AgentManagerWorktreeDiffFileMessage) => {
        if (ev.diff) {
          setDiffDatas((prev) => {
            const existing = prev[ev.sessionId] ?? []
            const next = existing.map((item) => (item.file === ev.diff!.file ? ev.diff! : item))
            return { ...prev, [ev.sessionId]: next }
          })
          setDiffFilePending(ev.sessionId, ev.diff.file, false)
          return
        }
        setDiffFilePending(ev.sessionId, ev.file, false)
      },
      "agentManager.worktreeDiffLoading": (ev: AgentManagerWorktreeDiffLoadingMessage) => {
        setDiffLoading(ev.loading)
      },
      "agentManager.applyWorktreeDiffResult": (ev: AgentManagerApplyWorktreeDiffResultMessage) => {
        const files = new Set((ev.conflicts ?? []).map((entry) => entry.file).filter(Boolean)).size
        const count = ev.conflicts?.length ?? 0

        if (ev.status === "success") {
          showToast({ variant: "success", title: t("agentManager.apply.success"), description: ev.message })
          if (applyTarget() === ev.worktreeId) closeApplyDialog()
        } else if (ev.status === "conflict") {
          const summary =
            count > 0 ? t("agentManager.apply.conflictToast", { count, files: Math.max(files, 1) }) : ev.message
          showToast({ variant: "error", title: t("agentManager.apply.conflict"), description: summary })
        } else if (ev.status === "error") {
          showToast({ variant: "error", title: t("agentManager.apply.error"), description: ev.message })
        }
      }
    }

    const unsub = vscode.onMessage((msg) => {
      const fn = worktreeHandlers[msg.type]
      if (fn) fn(msg)
    })

    // Separate subscription for stats, settings, and thread replies to keep main-handler complexity in check.
    const miscHandlers: Record<string, (msg: any) => void> = {
      "agentManager.revertWorktreeFileResult": (msg: any) => revertCtl.onResult(msg),
      "agentManager.worktreeStats": (ev: AgentManagerWorktreeStatsMessage) => {
        const map: Record<string, WorktreeGitStats> = {}
        for (const s of ev.stats) map[s.worktreeId] = s
        setWorktreeStats(map)
      },
      "agentManager.localStats": (ev: AgentManagerLocalStatsMessage) => {
        setLocalStats(ev.stats)
        setRepoBranch(ev.stats.branch)
      },
      "agentManager.prStatus": (ev: AgentManagerPRStatusMessage) => {
        setPrStatuses((prev) => ({ ...prev, [ev.worktreeId]: ev.pr }))
      },
      "settingLoaded": (msg: { key: string; value: unknown }) => {
        console.log("[AM:unsubMisc] settingLoaded HIT:", msg.key, "=", msg.value)
        WebviewLogger.info("AgentManagerApp", "[AgentManager] settingLoaded:", msg.key, msg.value)
        if (msg.key === "diff.eagerLoad") setEagerLoad(msg.value as boolean)
        if (msg.key === "diffViewer.instantComments") {
          setInstantComments(msg.value as boolean)
          console.log("[AM:unsubMisc] instantComments set to:", msg.value, "signal now:", instantComments())
        }
      },
      "diffViewer.threadReply": (msg: { threadId: string; message: any }) => {
        if (typeof msg.threadId === "string") {
          WebviewLogger.info("AgentManagerApp", "[AgentManager] threadReply received:", msg.threadId)
          setReviewThreads((prev) =>
            prev.map((t) =>
              t.id === msg.threadId ? { ...t, messages: [...t.messages, msg.message], pending: false } : t,
            ),
          )
        }
      },
      "diffViewer.explainResult": (msg: any) => {
        if (msg.done) setExplainingDiffs(false)
        if (msg.error) {
          WebviewLogger.error("AgentManagerApp", "[AgentManager] diffViewer.explainResult error:", msg.error)
          return
        }
        const threads = msg.threads
        if (threads) {
          setReviewThreads((prev) => {
            const ids = new Set(threads.map((t: ReviewThread) => t.id))
            const manual = prev.filter((t) => !ids.has(t.id))
            return [...manual, ...threads]
          })
        }
        if (msg.summary) setReviewSummary(msg.summary)
      }
    }

    const unsubMisc = vscode.onMessage((msg) => {
      // DEBUG: log every message type arriving in this handler
      if (
        msg.type?.startsWith("settingLoaded") ||
        msg.type?.startsWith("diffViewer") ||
        msg.type?.startsWith("agentManager.revert") ||
        msg.type?.startsWith("agentManager.worktree") ||
        msg.type?.startsWith("agentManager.local") ||
        msg.type?.startsWith("agentManager.pr")
      ) {
        console.log("[AM:unsubMisc] received:", msg.type, msg)
      }
      const fn = miscHandlers[msg.type]
      if (fn) fn(msg)
    })

    onCleanup(() => {
      window.removeEventListener("message", handler)
      window.removeEventListener("keydown", preventDefaults, true)
      window.removeEventListener("keydown", deleteKeyHandler)
      window.removeEventListener("focus", onWindowFocus)
      unsubCreate()
      unsubSessions()
      unsubRun()
      unsubTerminals()
      unsub()
      unsubMisc()
    })
  })

  // Always select local on mount to initialize branch info and session state
  onMount(() => {
    console.log("[AM:onMount] AgentManagerApp mounted, sending requestSetting messages")
    selectLocal()
    // Request worktree/session state from extension — handles race where
    // initializeState() pushState fires before the webview is mounted
    vscode.postMessage({ type: "agentManager.requestState" })
    vscode.postMessage({ type: "requestSetting", key: "diff.eagerLoad" })
    vscode.postMessage({ type: "requestSetting", key: "diffViewer.instantComments" })
    console.log("[AM:onMount] requestSetting messages sent, current instantComments:", instantComments())
    // Open a pending "New Session" tab if there are no persisted local sessions
    if (localSessionIDs().length === 0) {
      addPendingTab()
    }
  })

  // Start/stop diff watch when panel opens/closes, review tab opens, or session changes
  createEffect(() => {
    const panel = diffOpen()
    const review = reviewActive()
    const sel = selection()
    const id = session.currentSessionID()
    if (panel) {
      if (sel === LOCAL) {
        // For local tab, diff against unpushed changes using LOCAL sentinel
        vscode.postMessage({ type: "agentManager.startDiffWatch", sessionId: LOCAL })
        return
      } else if (id) {
        const ms = managedSessions().find((s) => s.id === id)
        if (ms?.worktreeId) {
          vscode.postMessage({ type: "agentManager.startDiffWatch", sessionId: id })
          return
        }
      }
      vscode.postMessage({ type: "agentManager.stopDiffWatch" })
      return
    }
    if (review) {
      // Review tab is open but no specific session — use local sentinel for local,
      // or any session in the selected worktree.
      if (sel === LOCAL) {
        vscode.postMessage({ type: "agentManager.startDiffWatch", sessionId: LOCAL })
        return
      }
      if (sel) {
        const managed = managedSessions().find((ms) => ms.worktreeId === sel)
        if (managed) {
          vscode.postMessage({ type: "agentManager.startDiffWatch", sessionId: managed.id })
          return
        }
      }
      vscode.postMessage({ type: "agentManager.stopDiffWatch" })
      return
    }
    vscode.postMessage({ type: "agentManager.stopDiffWatch" })
  })

  onCleanup(() => {
    if (diffOpen() || reviewActive()) {
      vscode.postMessage({ type: "agentManager.stopDiffWatch" })
    }
  })



  const setSharedDiffStyle = (style: "unified" | "split") => {
    if (reviewDiffStyle() === style) return
    setReviewDiffStyle(style)
    vscode.postMessage({ type: "agentManager.setReviewDiffStyle", style })
  }

  const setDiffFilePending = (sessionId: string, file: string, value: boolean) => {
    setDiffFileLoading((prev) => {
      const session = prev[sessionId] ?? {}
      if (value) {
        if (session[file]) return prev
        return {
          ...prev,
          [sessionId]: { ...session, [file]: true },
        }
      }

      if (!session[file]) return prev
      const next = { ...session }
      delete next[file]
      if (Object.keys(next).length === 0) {
        const result = { ...prev }
        delete result[sessionId]
        return result
      }
      return {
        ...prev,
        [sessionId]: next,
      }
    })
  }

  const requestDiffFile = (file: string) => {
    const sessionId = currentDiffSessionId()
    if (!sessionId) return
    if (diffFileLoading()[sessionId]?.[file]) return
    setDiffFilePending(sessionId, file, true)
    vscode.postMessage({ type: "agentManager.requestWorktreeDiffFile", sessionId, file })
  }

  const refreshStaleDiffs = (sessionId: string, files: Set<string>) => {
    const loading = diffFileLoading()[sessionId] ?? {}
    for (const file of files) {
      if (loading[file]) continue
      setDiffFilePending(sessionId, file, true)
      vscode.postMessage({ type: "agentManager.requestWorktreeDiffFile", sessionId, file })
    }
  }

  const diffFileLoadingForCurrent = createMemo(() => {
    const sessionId = currentDiffSessionId()
    if (!sessionId) return new Set<string>()
    return new Set(Object.keys(diffFileLoading()[sessionId] ?? {}))
  })

  const revertCtl = createRevertFile(currentDiffSessionId, vscode, showToast, t)

  const handleConfigureSetupScript = () => {
    vscode.postMessage({ type: "agentManager.configureSetupScript" })
  }

  const handleChangeDefaultBaseBranch = () => {
    const [search, setSearch] = createSignal("")
    const [branches, setBranches] = createSignal<BranchInfo[]>([])
    const [loading, setLoading] = createSignal(true)
    const [highlighted, setHighlighted] = createSignal(-1)

    const unsub = vscode.onMessage((msg) => {
      if (msg.type === "agentManager.branches") {
        const ev = msg as AgentManagerBranchesMessage
        setBranches(ev.branches)
        if (ev.defaultBranch) setRepoDetectedBranch(ev.defaultBranch)
        setLoading(false)
      }
    })

    vscode.postMessage({ type: "agentManager.requestBranches" })

    const filtered = createMemo(() => {
      const s = search().toLowerCase()
      if (!s) return branches()
      return branches().filter((b) => b.name.toLowerCase().includes(s))
    })

    const selectBranch = (name: string | undefined) => {
      vscode.postMessage({ type: "agentManager.setDefaultBaseBranch", branch: name })
      setDefaultBaseBranch(name)
      dialog.close()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = filtered()
      // offset by 1 for auto-detect option (-1 = auto-detect)
      const total = items.length + 1
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        setHighlighted((prev) => Math.min(prev + 1, total - 2))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        setHighlighted((prev) => Math.max(prev - 1, -1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        const idx = highlighted()
        if (idx === -1) {
          selectBranch(undefined)
        } else {
          const branch = items[idx]
          if (branch) selectBranch(branch.name)
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        dialog.close()
      }
    }

    dialog.show(() => {
      onCleanup(unsub)
      return (
        <Dialog title={t("agentManager.worktree.defaultBaseBranch")} fit>
          <div class="am-default-base-branch">
            <BranchSelect
              branches={filtered()}
              loading={loading()}
              search={search()}
              onSearch={(v) => {
                setSearch(v)
                setHighlighted(-1)
              }}
              onSelect={(b) => selectBranch(b.name)}
              onSearchKeyDown={handleKeyDown}
              selected={defaultBaseBranch()}
              highlighted={highlighted()}
              onHighlight={setHighlighted}
              searchPlaceholder={t("agentManager.dialog.searchBranches")}
              emptyLabel={t("agentManager.import.noMatchingBranches")}
              loadingLabel={t("agentManager.import.loadingBranches")}
              defaultLabel={t("agentManager.dialog.branchBadge.default")}
              remoteLabel={t("agentManager.dialog.branchBadge.remote")}
              defaultName={defaultBaseBranch()}
              autoOption={{
                label: t("agentManager.worktree.defaultBaseBranchAuto"),
                hint: repoDetectedBranch(),
                active: !hasConfiguredBranch(),
                highlighted: highlighted() === -1,
                onSelect: () => selectBranch(undefined),
              }}
            />
          </div>
        </Dialog>
      )
    })
  }

  const handleShowKeyboardShortcuts = () => {
    const categories = buildShortcutCategories(kb(), t)
    dialog.show(() => (
      <Dialog title={t("agentManager.shortcuts.title")} fit>
        <div class="am-shortcuts">
          <For each={categories}>
            {(category) => (
              <div class="am-shortcuts-category">
                <div class="am-shortcuts-category-title">{category.title}</div>
                <div class="am-shortcuts-list">
                  <For each={category.shortcuts}>
                    {(shortcut) => (
                      <div class="am-shortcuts-row">
                        <span class="am-shortcuts-label">{shortcut.label}</span>
                        <span class="am-shortcuts-keys">
                          <For each={parseBindingTokens(shortcut.binding)}>
                            {(token) => <kbd class="am-kbd">{token}</kbd>}
                          </For>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Dialog>
    ))
  }

  const loaded = () => worktreesLoaded() && sessionsLoaded()

  const handleCreateWorktree = () => {
    if (!loaded()) return
    vscode.postMessage({ type: "agentManager.createWorktree" })
  }

  // Advanced worktree dialog — opens a full dialog with prompt, versions, model, mode
  const showAdvancedWorktreeDialog = () => {
    if (!loaded()) return
    dialog.show(() => <NewWorktreeDialog onClose={() => dialog.close()} defaultBaseBranch={repoDefaultBranch()} />)
  }

  const confirmDeleteWorktree = (worktreeId: string, force?: boolean) => {
    const wt = worktrees().find((w) => w.id === worktreeId)
    if (!wt) return

    // Second press/click or force: execute the delete
    if (force || pendingDelete() === worktreeId) {
      cancelPendingDelete()
      setBusyWorktrees((prev) => new Map([...prev, [wt.id, { reason: "deleting" as const }]]))
      vscode.postMessage({ type: "agentManager.deleteWorktree", worktreeId: wt.id })
      if (selection() === wt.id) {
        const next = nextSelectionAfterDelete(
          wt.id,
          sidebarOrder()
            .filter((f) => f.type === "wt")
            .map((f) => f.id),
        )
        if (next === LOCAL) selectLocal()
        else selectWorktree(next)
      }
      return
    }

    // First press/click: enter pending-delete state
    clearTimeout(pendingDeleteTimer)
    setPendingDelete(worktreeId)
    pendingDeleteTimer = setTimeout(() => setPendingDelete(null), 2500)
  }

  const confirmRemoveStaleWorktree = (worktreeId: string) => {
    const wt = worktrees().find((w) => w.id === worktreeId)
    if (!wt) return

    const remove = () => {
      vscode.postMessage({ type: "agentManager.removeStaleWorktree", worktreeId: wt.id })
      if (selection() === wt.id) {
        const next = nextSelectionAfterDelete(
          wt.id,
          sidebarOrder()
            .filter((f) => f.type === "wt")
            .map((f) => f.id),
        )
        if (next === LOCAL) selectLocal()
        if (next !== LOCAL) selectWorktree(next)
      }
      dialog.close()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        remove()
      }
    }

    dialog.show(() => (
      <Dialog title={t("agentManager.dialog.removeStaleWorktree.title")} fit>
        <div class="am-confirm" onKeyDown={onKeyDown}>
          <div class="am-confirm-message">
            <Icon name="warning" size="small" />
            <span>
              {t("agentManager.dialog.removeStaleWorktree.messagePre")}
              <code class="am-confirm-branch">{wt.branch}</code>
              {t("agentManager.dialog.removeStaleWorktree.messagePost")}
            </span>
          </div>
          <div class="am-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {t("agentManager.dialog.removeStaleWorktree.cancel")}
            </Button>
            <Button variant="primary" size="large" class="am-confirm-delete" onClick={remove} autofocus>
              {t("agentManager.dialog.removeStaleWorktree.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const handleDeleteWorktree = (worktreeId: string, e: MouseEvent | undefined, force?: boolean) => {
    if (e) e.stopPropagation()
    confirmDeleteWorktree(worktreeId, force)
  }

  const handlePromote = (sessionId: string, e: MouseEvent) => {
    e.stopPropagation()
    if (!loaded()) return
    vscode.postMessage({ type: "agentManager.promoteSession", sessionId })
  }

  const openLocally = (sid: string) => {
    saveTabMemory()
    const pending = activePendingId()
    if (pending) {
      setLocalSessionIDs((prev) => prev.map((id) => (id === pending ? sid : id)))
      setActivePendingId(undefined)
    } else setLocalSessionIDs((prev) => [...prev, sid])
    setSelection(LOCAL)
    setReviewActive(false)
    session.selectSession(sid)
    vscode.postMessage({ type: "agentManager.openLocally", sessionId: sid })
  }

  const handleAddSession = () => {
    const sel = selection()
    if (sel === LOCAL) return addPendingTab()
    if (sel) {
      // Deactivate any focused terminal so the new session is visible.
      terms.setActiveId(undefined)
      vscode.postMessage({ type: "agentManager.addSessionToWorktree", worktreeId: sel })
    }
  }
  const handleForkSession = (sessionId: string, messageId?: string) => {
    const sel = selection()
    const msg = { type: "agentManager.forkSession" as const, sessionId, ...(messageId ? { messageId } : {}) }
    if (!sel || sel === LOCAL) return vscode.postMessage(msg)
    vscode.postMessage({ ...msg, worktreeId: sel })
  }
  const handleCloseTab = (sessionId: string) => {
    const pending = isPending(sessionId)
    const isActive = pending ? sessionId === activePendingId() : session.currentSessionID() === sessionId
    if (isActive) {
      const tabs = activeTabs()
      const idx = tabs.findIndex((s) => s.id === sessionId)
      const next = tabs[idx + 1] ?? tabs[idx - 1]
      if (next && isPending(next.id)) {
        setActivePendingId(next.id)
        session.clearCurrentSession()
      } else if (next) {
        setActivePendingId(undefined)
        session.selectSession(next.id)
      } else {
        setActivePendingId(undefined)
        session.clearCurrentSession()
      }
    }
    if (pending || localSet().has(sessionId)) {
      setLocalSessionIDs((prev) => prev.filter((id) => id !== sessionId))
      if (!pending) vscode.postMessage({ type: "agentManager.forgetSession", sessionId })
    } else {
      vscode.postMessage({ type: "agentManager.closeSession", sessionId })
    }
  }

  const handleTabMouseDown = (sessionId: string, e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      handleCloseTab(sessionId)
    }
  }

  const selectSessionTab = (id: string, pending: boolean) => {
    setReviewActive(false)
    if (pending) {
      setActivePendingId(id)
      session.clearCurrentSession()
    } else {
      setActivePendingId(undefined)
      session.selectSession(id)
    }
  }
  const termHandlers = createTerminalHandlers({
    state: terms,
    tabIds: () => tabIds(),
    selectReview: () => setReviewActive(true),
    selectSessionTab,
    clearSession: () => session.clearCurrentSession(),
    resetOthers: () => {
      setReviewActive(false)
      setActivePendingId(undefined)
      session.clearCurrentSession()
    },
    isPendingId: isPending,
    findTab: (id) => tabLookup().get(id),
    postMessage: (msg) => vscode.postMessage(msg as never),
    getSelection: selection,
    LOCAL,
    REVIEW_TAB_ID,
  })

  const handleReviewTabMouseDown = (e: MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    e.stopPropagation()
    closeReviewTab()
  }

  // Drag-and-drop handlers for tab reordering
  const tabLookup = createMemo(() => new Map(activeTabs().map((s) => [s.id, s])))
  const tabIds = createMemo(() => {
    const ids = activeTabs().map((s) => s.id)
    const sel = selection()
    if (sel === null) return ids
    const withReview = reviewOpen() ? [...ids, REVIEW_TAB_ID] : ids
    const terminalIds = terms.current().map((t) => t.id)
    const base = [...withReview, ...terminalIds]
    // `worktreeTabOrder` stores the per-context mixed order. Applied
    // for every context (LOCAL too) and persisted server-side via
    // `setTabOrder`; unknown IDs are filtered by `applyTabOrder`.
    const key = sel === LOCAL ? LOCAL : sel
    return applyTabOrder(
      base.map((id) => ({ id })),
      worktreeTabOrder()[key],
    ).map((item) => item.id)
  })

  const handleDragStart = (event: DragEvent) => {
    const id = event.draggable?.id
    if (typeof id === "string") setDraggingTab(id)
  }

  const handleDragOver = (event: DragEvent) => {
    const from = event.draggable?.id
    const to = event.droppable?.id
    if (typeof from !== "string" || typeof to !== "string") return
    const sel = selection()
    if (sel === null) return
    const key = sel === LOCAL ? LOCAL : sel
    // Unified mixed-drag: the current visible order is `tabIds()` and
    // includes sessions, review, and terminals. `reorderTabs` moves
    // `from` to `to`'s position regardless of kind, so a user can slot
    // a terminal between two sessions or vice versa.
    const reordered = reorderTabs(tabIds(), from, to)
    if (!reordered) return
    setWorktreeTabOrder((prev) => ({ ...prev, [key]: reordered }))
    // Keep the session-only list in sync for LOCAL so `localSessions()`
    // and membership checks stay aligned after a drag.
    if (key === LOCAL) {
      const sessionSubset = reordered.filter((id) => id !== REVIEW_TAB_ID && !isTerminalTabId(id))
      setLocalSessionIDs(sessionSubset)
    }
    // Mirror the order into the terminal state so `terms.current()`
    // (the source for renderTerminalLayer's slot order) matches.
    const terminalSubset = reordered.filter(isTerminalTabId)
    if (terminalSubset.length > 0) terms.reorder(key, terminalSubset)
  }

  const handleDragEnd = () => {
    setDraggingTab(undefined)
    const sel = selection()
    if (sel === null) return
    const key = sel === LOCAL ? LOCAL : sel
    const order = worktreeTabOrder()[key]
    if (order && order.length > 0) persistTabOrder(key, order)
  }

  const draggedTab = createMemo(() => {
    const id = draggingTab()
    if (!id) return undefined
    if (id === REVIEW_TAB_ID) return { id, title: t("session.tab.review") }
    if (isTerminalTabId(id)) {
      const term = terms.lookup().get(id)
      return term ? { id, title: term.title } : undefined
    }
    return activeTabs().find((s) => s.id === id)
  })

  // Close the currently active tab via keyboard shortcut.
  // If no tabs remain, fall through to close the selected worktree.
  const closeActiveTab = () => {
    if (termHandlers.closeActive()) return
    if (reviewActive()) {
      closeReviewTab()
      return
    }
    const tabs = activeTabs()
    if (tabs.length === 0) {
      closeSelectedWorktree()
      return
    }
    const current = session.currentSessionID()
    const pending = activePendingId()
    const target = current
      ? tabs.find((s) => s.id === current)
      : pending
        ? tabs.find((s) => s.id === pending)
        : undefined
    if (!target) return
    handleCloseTab(target.id)
  }

  // Cmd+T: add a new tab strictly to the current selection (no side effects)
  const handleNewTabForCurrentSelection = () => {
    const sel = selection()
    if (sel === LOCAL) {
      addPendingTab()
    } else if (sel) {
      // Pass the captured worktree ID directly to avoid race conditions
      vscode.postMessage({ type: "agentManager.addSessionToWorktree", worktreeId: sel })
    }
  }

  // Cmd+N: if an unassigned session is selected, promote it; otherwise create a new worktree
  const handleNewWorktreeOrPromote = () => {
    if (!loaded()) return
    const sel = selection()
    const sid = session.currentSessionID()
    if (sel === null && sid && !worktreeSessionIds().has(sid)) {
      vscode.postMessage({ type: "agentManager.promoteSession", sessionId: sid })
      return
    }
    handleCreateWorktree()
  }

  // Close the currently selected worktree with a confirmation dialog
  const closeSelectedWorktree = () => {
    const sel = selection()
    if (!sel || sel === LOCAL) return
    confirmDeleteWorktree(sel)
  }

  const openFile = (file: string, line?: number) => {
    const id = currentDiffSessionId()
    if (id) vscode.postMessage({ type: "agentManager.openFile", sessionId: id, filePath: file, line })
    else if (selection() === LOCAL) vscode.postMessage({ type: "openFile", filePath: file, line })
  }
  const startThread = (
    threadId: string,
    file: string,
    side: string | undefined,
    line: number,
    endLine: number | undefined,
    text: string,
  ) => {
    const msg = { id: Math.random().toString(36).substring(2, 9), author: "user" as const, text, timestamp: Date.now() }
    setReviewThreads((prev) => [
      ...prev,
      {
        id: threadId,
        file,
        side: side as ReviewThread["side"],
        line,
        ...(endLine !== undefined ? { endLine } : {}),
        messages: [msg],
        pending: true,
      },
    ])
    vscode.postMessage({ type: "diffViewer.startThread", threadId, file, line, endLine, text })
  }
  const replyThread = (threadId: string, text: string) => {
    const msg = { id: Math.random().toString(36).substring(2, 9), author: "user" as const, text, timestamp: Date.now() }
    setReviewThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, messages: [...t.messages, msg], pending: true } : t)),
    )
    vscode.postMessage({ type: "diffViewer.replyToThread", threadId, text })
  }

  const renderSidebar = () => (
      <div class="am-sidebar" style={{ width: `${sidebarWidth()}px` }}>
        <ResizeHandle
          direction="horizontal"
          size={sidebarWidth()}
          min={MIN_SIDEBAR_WIDTH}
          max={9999}
          onResize={(width) => {
            pendingSidebarWidth = Math.min(width, window.innerWidth * MAX_SIDEBAR_WIDTH_RATIO)
            if (sidebarRaf === undefined) {
              sidebarRaf = requestAnimationFrame(() => {
                sidebarRaf = undefined
                setSidebarWidth(pendingSidebarWidth!)
              })
            }
          }}
        />
        {/* Local repo item */}
        <button
          class={`am-local-item ${selection() === LOCAL ? "am-local-item-active" : ""}`}
          data-sidebar-id="local"
          onClick={() => selectLocal()}
        >
          <Show when={!isLocalBusy()} fallback={<Spinner class="am-worktree-spinner" />}>
            <svg class="am-local-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2.5" y="3.5" width="15" height="10" rx="1" stroke="currentColor" />
              <path d="M6 16.5H14" stroke="currentColor" stroke-linecap="square" />
              <path d="M10 13.5V16.5" stroke="currentColor" />
            </svg>
          </Show>
          <div class="am-local-text">
            <span class="am-local-label">{t("agentManager.local")}</span>
            <Show when={repoBranch()}>
              <span class="am-local-branch">{repoBranch()}</span>
            </Show>
          </div>
          <Show when={localStats() === undefined}>
            <div class="am-worktree-stats-skeleton">
              <div class="am-worktree-stats-skeleton-row" />
              <div class="am-worktree-stats-skeleton-row" style={{ width: "70%" }} />
            </div>
          </Show>
          <Show
            when={
              localStats() &&
              (localStats()!.files > 0 ||
                localStats()!.additions > 0 ||
                localStats()!.deletions > 0 ||
                localStats()!.ahead > 0 ||
                localStats()!.behind > 0)
            }
          >
            <div class="am-worktree-stats">
              <Show
                when={localStats()!.additions > 0 || localStats()!.deletions > 0}
                fallback={
                  <Show when={localStats()!.files > 0}>
                    <span class="am-stat-files">{localStats()!.files}f</span>
                  </Show>
                }
              >
                <div class="am-worktree-stats-row">
                  <Show when={localStats()!.additions > 0}>
                    <span class="am-stat-additions">+{localStats()!.additions}</span>
                  </Show>
                  <Show when={localStats()!.deletions > 0}>
                    <span class="am-stat-deletions">
                      {"\u2212"}
                      {localStats()!.deletions}
                    </span>
                  </Show>
                </div>
              </Show>
              <Show when={localStats()!.ahead > 0 || localStats()!.behind > 0}>
                <div class="am-worktree-stats-row">
                  <Show when={localStats()!.ahead > 0}>
                    <span class="am-worktree-commits">
                      {"↑"}
                      {localStats()!.ahead}
                    </span>
                  </Show>
                  <Show when={localStats()!.behind > 0}>
                    <span class="am-worktree-behind">
                      {"↓"}
                      {localStats()!.behind}
                    </span>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
          <span class="am-shortcut-badge">{isMac ? "⌘" : "Ctrl+"}1</span>
        </button>

        {/* WORKTREES section */}
        <div class={`am-section ${sessionsCollapsed() ? "am-section-grow" : ""}`}>
          <div class="am-section-header">
            <span class="am-section-label">{t("agentManager.section.worktrees")}</span>
            <Show when={isGitRepo()}>
              <div class="am-section-actions">
                <div class="am-split-button">
                  <IconButton
                    icon="plus"
                    size="small"
                    variant="ghost"
                    label={t("agentManager.worktree.new")}
                    onClick={handleCreateWorktree}
                    disabled={!loaded()}
                  />
                  <DropdownMenu gutter={4} placement="bottom-end">
                    <DropdownMenu.Trigger
                      class="am-split-arrow"
                      aria-label={t("agentManager.worktree.advancedOptions")}
                      disabled={!loaded()}
                    >
                      <Icon name="chevron-down" size="small" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content class="am-split-menu">
                        <DropdownMenu.Item onSelect={handleCreateWorktree}>
                          <span class="am-worktree-menu-gap" aria-hidden="true" />
                          <DropdownMenu.ItemLabel class="am-worktree-menu-label">
                            <span>{t("sidebar.session.newWorktree.from")}</span>
                            <span class="am-worktree-menu-branch">
                              <Icon name="branch" size="small" />
                              <strong>{repoDefaultBranch()}</strong>
                            </span>
                          </DropdownMenu.ItemLabel>
                          <span class="am-menu-shortcut">
                            {parseBindingTokens(kb().newWorktree ?? "").map((token) => (
                              <kbd class="am-menu-key">{token}</kbd>
                            ))}
                          </span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={showAdvancedWorktreeDialog}>
                          <Icon name="settings-gear" size="small" />
                          <DropdownMenu.ItemLabel>{t("agentManager.dialog.configureWorktree")}</DropdownMenu.ItemLabel>
                          <span class="am-menu-shortcut">
                            {parseBindingTokens(kb().advancedWorktree ?? "").map((token) => (
                              <kbd class="am-menu-key">{token}</kbd>
                            ))}
                          </span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item onSelect={() => newSection()}>
                          <Icon name="plus" size="small" />
                          <DropdownMenu.ItemLabel>{t("agentManager.worktree.newSection")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </div>
                <TooltipKeybind
                  title={t("agentManager.shortcuts.title")}
                  keybind={kb().showShortcuts ?? ""}
                  placement="bottom"
                >
                  <IconButton
                    icon="keyboard"
                    size="small"
                    variant="ghost"
                    label={t("agentManager.shortcuts.title")}
                    onClick={handleShowKeyboardShortcuts}
                  />
                </TooltipKeybind>
                <DropdownMenu gutter={4} placement="bottom-end">
                  <DropdownMenu.Trigger
                    as={IconButton}
                    icon="settings-gear"
                    size="small"
                    variant="ghost"
                    label={t("agentManager.worktree.settings")}
                  />
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="am-split-menu">
                      <DropdownMenu.Item onSelect={handleConfigureSetupScript}>
                        <DropdownMenu.ItemLabel>{t("agentManager.worktree.setupScript")}</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item onSelect={handleChangeDefaultBaseBranch}>
                        <DropdownMenu.ItemLabel>
                          {t("agentManager.worktree.defaultBaseBranch")}: {repoDefaultBranch()}
                        </DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </div>
            </Show>
          </div>
          <div class="am-worktree-list">
            <Show
              when={worktreesLoaded() && sessionsLoaded()}
              fallback={
                <div class="am-skeleton-list">
                  <div class="am-skeleton-wt">
                    <div class="am-skeleton-wt-icon" />
                    <div class="am-skeleton-wt-text" style={{ width: "60%" }} />
                  </div>
                </div>
              }
            >
              <Show when={!isGitRepo()}>
                <div class="am-not-git-notice">
                  <Icon name="warning" size="small" />
                  <span>{t("agentManager.notGitRepo")}</span>
                </div>
              </Show>
              <Show when={isGitRepo()}>
                {(() => {
                  const [renamingWt, setRenamingWt] = createSignal<string | null>(null)
                  const [renameValue, setRenameValue] = createSignal("")

                  const startRename = (wtId: string, current: string) => {
                    setRenamingWt(wtId)
                    setRenameValue(current)
                  }

                  let cancelled = false

                  const commitRename = (wtId: string) => {
                    if (cancelled) {
                      cancelled = false
                      return
                    }
                    const value = renameValue().trim()
                    setRenamingWt(null)
                    if (!value) return
                    vscode.postMessage({ type: "agentManager.renameWorktree", worktreeId: wtId, label: value })
                  }

                  const cancelRename = () => {
                    cancelled = true
                    setRenamingWt(null)
                  }

                  const hasSections = createMemo(() => sections().length > 0)
                  const wtIds = createMemo(() => sortedWorktrees().map((wt) => wt.id))
                  const secIds = createMemo(() => new Set(sections().map((s) => s.id)))
                  const home = () => new Map(sortedWorktrees().map((w) => [w.id, w.sectionId] as const))
                  const sectionAware = sectionAwareDetector(secIds, home)

                  const onWtDragStart = (event: DragEvent) => {
                    const id = event.draggable?.id
                    if (typeof id === "string") setDraggingWorktree(id)
                    document.body.classList.add("am-wt-dragging-active")
                  }
                  const onWtDragOver = (event: DragEvent) => {
                    const from = event.draggable?.id
                    const to = event.droppable?.id
                    if (typeof from !== "string" || typeof to !== "string") return
                    if (secIds().has(to)) return
                    setSidebarWorktreeOrder((prev) => {
                      const cur = applyTabOrder(
                        sortedWorktrees().map((w) => ({ id: w.id })),
                        prev,
                      ).map((i) => i.id)
                      return reorderTabs(cur, from, to) ?? prev
                    })
                  }
                  const onWtDragEnd = (event: DragEvent) => {
                    const from = event.draggable?.id
                    const to = event.droppable?.id
                    setDraggingWorktree(undefined)
                    document.body.classList.remove("am-wt-dragging-active")
                    if (typeof from === "string" && typeof to === "string" && secIds().has(to)) {
                      moveToSection([from], to)
                      return
                    }
                    vscode.postMessage({ type: "agentManager.setWorktreeOrder", order: sidebarWorktreeOrder() })
                  }

                  return (
                    <DragDropProvider
                      onDragStart={onWtDragStart}
                      onDragEnd={onWtDragEnd}
                      onDragOver={onWtDragOver}
                      collisionDetector={sectionAware}
                    >
                      <DragDropSensors />
                      <ConstrainDragXAxis />
                      <SortableProvider ids={wtIds()}>
                        {(() => {
                          const renderWt = (wt: WorktreeState, idx: () => number, list?: WorktreeState[]) => {
                            const wtSessions = createMemo(() =>
                              managedSessions().filter((ms) => ms.worktreeId === wt.id),
                            )
                            const navHint = () =>
                              adjacentHint(
                                wt.id,
                                selection() ?? session.currentSessionID() ?? "",
                                sidebarOrder().map((f) => f.id),
                                kb().previousSession ?? "",
                                kb().nextSession ?? "",
                              )
                            const groupSize = () =>
                              !wt.groupId ? 0 : sortedWorktrees().filter((w) => w.groupId === wt.groupId).length
                            const sortable = createSortable(wt.id)
                            void sortable
                            return (
                              <div
                                use:sortable
                                class={`am-wt-sortable ${sortable.isActiveDraggable ? "am-wt-dragging" : ""}`}
                              >
                                <WorktreeItem
                                  worktree={wt}
                                  label={worktreeLabel(wt)}
                                  subtitle={worktreeSubtitle(wt)}
                                  active={selection() === wt.id}
                                  pendingDelete={pendingDelete() === wt.id}
                                  busy={busyWorktrees().has(wt.id)}
                                  working={isAgentBusy(wt.id)}
                                  stale={isStaleWorktree(wt.id)}
                                  shortcut={shortcutMap().get(wt.id)}
                                  stats={worktreeStats()[wt.id]}
                                  navHint={navHint()}
                                  sessions={wtSessions().length}
                                  grouped={isGrouped(wt)}
                                  groupStart={isGroupStart(wt, idx(), list ?? sortedWorktrees())}
                                  groupEnd={isGroupEnd(wt, idx(), list ?? sortedWorktrees())}
                                  groupSize={groupSize()}
                                  renaming={renamingWt() === wt.id}
                                  renameValue={renameValue()}
                                  closeKeybind={kb().closeWorktree ?? ""}
                                  openKeybind={kb().openWorktree ?? ""}
                                  pr={
                                    prStatuses()[wt.id] !== undefined ? (prStatuses()[wt.id] ?? undefined) : undefined
                                  }
                                  runStatus={runStatuses()[wt.id]}
                                  onOpenPR={() =>
                                    vscode.postMessage({ type: "agentManager.openPR", worktreeId: wt.id })
                                  }
                                  sections={sections()}
                                  currentSectionId={wt.sectionId}
                                  onMoveToSection={(secId) => moveToSection([wt.id], secId)}
                                  onMoveToNewSection={() => newSection()}
                                  onClick={() => {
                                    if (pendingDelete() === wt.id) {
                                      confirmDeleteWorktree(wt.id)
                                      return
                                    }
                                    selectWorktree(wt.id)
                                  }}
                                  onDelete={(e, force) => handleDeleteWorktree(wt.id, e, force)}
                                  onStartRename={(current) => startRename(wt.id, current)}
                                  onRenameInput={(v) => setRenameValue(v)}
                                  onCommitRename={() => commitRename(wt.id)}
                                  onCancelRename={cancelRename}
                                  onRemoveStale={() => confirmRemoveStaleWorktree(wt.id)}
                                  onCopyPath={() => navigator.clipboard.writeText(wt.path)}
                                  onOpen={() =>
                                    vscode.postMessage({ type: "agentManager.openWorktree", worktreeId: wt.id })
                                  }
                                />
                              </div>
                            )
                          }
                          if (hasSections()) {
                            const post = vscode.postMessage.bind(vscode)
                            return (
                              <For each={topLevelItems()}>
                                {(item, idx) => {
                                  if (item.kind === "section") {
                                    const sec = item.section
                                    const members = createMemo(() => worktreesInSection(sec.id))
                                    return (
                                      <SectionHeader
                                        section={sec}
                                        count={members().length}
                                        autoRename={renamingSection() === sec.id}
                                        onRenameEnd={() => setRenamingSection(null)}
                                        onToggle={() =>
                                          post({ type: "agentManager.toggleSectionCollapsed", sectionId: sec.id })
                                        }
                                        onRename={(name) =>
                                          post({ type: "agentManager.renameSection", sectionId: sec.id, name })
                                        }
                                        onDelete={() => post({ type: "agentManager.deleteSection", sectionId: sec.id })}
                                        onSetColor={(color) =>
                                          post({ type: "agentManager.setSectionColor", sectionId: sec.id, color })
                                        }
                                        isFirst={idx() === 0}
                                        isLast={idx() === topLevelItems().length - 1}
                                        onMoveUp={() => moveSection(sec.id, -1)}
                                        onMoveDown={() => moveSection(sec.id, 1)}
                                      >
                                        <Show when={!sec.collapsed}>
                                          <div class="am-section-group-body">
                                            <For each={members()}>{(wt, wtIdx) => renderWt(wt, wtIdx, members())}</For>
                                          </div>
                                        </Show>
                                      </SectionHeader>
                                    )
                                  }
                                  const ug = ungrouped()
                                  const wtIdx = () => ug.indexOf(item.wt)
                                  return renderWt(item.wt, wtIdx, ug)
                                }}
                              </For>
                            )
                          }
                          return <For each={sortedWorktrees()}>{(wt, idx) => renderWt(wt, idx)}</For>
                        })()}
                      </SortableProvider>
                      <DragOverlay>
                        {(() => {
                          const wt = sortedWorktrees().find((w) => w.id === draggingWorktree())
                          if (!wt) return null
                          return (
                            <div class="am-wt-overlay">
                              <Icon name="branch" size="small" />
                              <span>{worktreeLabel(wt)}</span>
                            </div>
                          )
                        })()}
                      </DragOverlay>
                    </DragDropProvider>
                  )
                })()}
                <Show when={worktrees().length === 0}>
                  <button class="am-worktree-create" onClick={handleCreateWorktree}>
                    <Icon name="plus" size="small" />
                    <span>{t("agentManager.worktree.new")}</span>
                  </button>
                </Show>
              </Show>
            </Show>
          </div>
        </div>

        {/* SESSIONS section (unassigned) — collapsible */}
        <div class={`am-section ${sessionsCollapsed() ? "" : "am-section-grow"}`}>
          <button
            class="am-section-header am-section-toggle"
            onClick={() => {
              const next = !sessionsCollapsed()
              setSessionsCollapsed(next)
              vscode.postMessage({ type: "agentManager.setSessionsCollapsed", collapsed: next })
            }}
          >
            <span class="am-section-label">
              <Icon
                name={sessionsCollapsed() ? "chevron-right" : "chevron-down"}
                size="small"
                class="am-section-chevron"
              />
              {t("agentManager.section.sessions")}
            </span>
          </button>
          <Show when={!sessionsCollapsed()}>
            <div class="am-list">
              <Show
                when={sessionsLoaded()}
                fallback={
                  <div class="am-skeleton-list">
                    <div class="am-skeleton-session">
                      <div class="am-skeleton-session-title" style={{ width: "70%" }} />
                      <div class="am-skeleton-session-time" />
                    </div>
                    <div class="am-skeleton-session">
                      <div class="am-skeleton-session-title" style={{ width: "55%" }} />
                      <div class="am-skeleton-session-time" />
                    </div>
                    <div class="am-skeleton-session">
                      <div class="am-skeleton-session-title" style={{ width: "65%" }} />
                      <div class="am-skeleton-session-time" />
                    </div>
                  </div>
                }
              >
                <For each={unassignedSessions()}>
                  {(s) => (
                    <ContextMenu>
                      <ContextMenu.Trigger as="div" style={{ display: "contents" }}>
                        <button
                          class={`am-item ${s.id === session.currentSessionID() && selection() === null ? "am-item-active" : ""}`}
                          data-sidebar-id={s.id}
                          onClick={() => {
                            saveTabMemory()
                            setSelection(null)
                            setReviewActive(false)
                            session.selectSession(s.id)
                          }}
                        >
                          <span class="am-item-title">{s.title || t("agentManager.session.untitled")}</span>
                          <span class="am-item-time">{formatRelativeDate(s.updatedAt)}</span>
                          <div class="am-item-promote">
                            <TooltipKeybind
                              title={t("agentManager.session.openInWorktree")}
                              keybind={kb().newWorktree ?? ""}
                              placement="right"
                            >
                              <IconButton
                                icon="branch"
                                size="small"
                                variant="ghost"
                                label={t("agentManager.session.openInWorktree")}
                                onClick={(e: MouseEvent) => handlePromote(s.id, e)}
                              />
                            </TooltipKeybind>
                          </div>
                        </button>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content class="am-ctx-menu">
                          <ContextMenu.Item onSelect={() => handlePromote(s.id, new MouseEvent("click"))}>
                            <Icon name="branch" size="small" />
                            <ContextMenu.ItemLabel>{t("agentManager.session.openInWorktree")}</ContextMenu.ItemLabel>
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => openLocally(s.id)}>
                            <Icon name="folder" size="small" />
                            <ContextMenu.ItemLabel>{t("agentManager.session.openLocally")}</ContextMenu.ItemLabel>
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </div>
      </div>
  )

  const renderDetail = () => (
      <div class="am-detail">
        {/* Tab bar — visible when a section is selected and has tabs or a pending new session */}
        <Show when={selection() !== null && !contextEmpty()}>
          <DragDropProvider
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <ConstrainDragYAxis />
            <div class="am-tab-bar">
              <div class="am-tab-scroll-area">
                <div class={`am-tab-fade am-tab-fade-left ${tabScroll.showLeft() ? "am-tab-fade-visible" : ""}`} />
                <div class="am-tab-list" ref={tabScroll.setRef}>
                  <SortableProvider ids={tabIds()}>
                    <For each={tabIds()}>
                      {(id) =>
                        renderTab(id, {
                          terms,
                          REVIEW_TAB_ID,
                          tabIds,
                          kb,
                          reviewActive,
                          currentSessionID: () => session.currentSessionID(),
                          activePendingId,
                          visibleTabId,
                          isPending,
                          tabLookup,
                          adjacentHint,
                          activateTerminal: termHandlers.activate,
                          deactivateTerminal: termHandlers.deactivate,
                          closeTerminal: termHandlers.closeTerminal,
                          terminalMiddleClick: termHandlers.middleClick,
                          closeReview: closeReviewTab,
                          reviewMiddleClick: handleReviewTabMouseDown,
                          selectReviewTab: () => setReviewActive(true),
                          selectSessionTab,
                          sessionMiddleClick: handleTabMouseDown,
                          sessionClose: handleCloseTab,
                          sessionFork: handleForkSession,
                          reviewLabel: t("session.tab.review"),
                          reviewTooltip: t("command.review.toggle"),
                        })
                      }
                    </For>
                  </SortableProvider>
                </div>
                <div class={`am-tab-fade am-tab-fade-right ${tabScroll.showRight() ? "am-tab-fade-visible" : ""}`} />
              </div>
              {renderNewTabButton({
                contextSelected: () => selection() !== null,
                kb,
                newSessionLabel: t("agentManager.session.new"),
                newTerminalLabel: t("agentManager.terminal.new"),
                newSessionMenuLabel: t("agentManager.session.newSession"),
                moreOptionsLabel: t("agentManager.tab.newOptions"),
                onNewSession: handleAddSession,
                onNewTerminal: () => termHandlers.requestNew(),
              })}
              <div class="am-tab-actions">
                {(() => {
                  const sel = () => selection()
                  const isWorktree = () => typeof sel() === "string" && sel() !== LOCAL
                  const stats = () => {
                    if (sel() === LOCAL) return localStats()
                    return typeof sel() === "string" ? worktreeStats()[sel() as string] : undefined
                  }
                  const hasChanges = () => {
                    const s = stats()
                    return s && (s.files > 0 || s.additions > 0 || s.deletions > 0)
                  }
                  const applyBusy = () => {
                    const state = applyStateForSelection()
                    if (!state) return false
                    return state.status === "checking" || state.status === "applying"
                  }
                  return (
                    <>
                      <Show when={isWorktree()}>
                        <>
                          <Tooltip value={t("agentManager.open.tooltip")} placement="bottom">
                            <Button size="small" variant="ghost" icon="folder" onClick={openWorktreeDirectory}>
                              {t("agentManager.open.button")}
                            </Button>
                          </Tooltip>
                          <Tooltip value={t("agentManager.apply.tooltip")} placement="bottom">
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={openApplyDialog}
                              disabled={!hasChanges() || applyBusy()}
                            >
                              <Show when={applyBusy()}>
                                <Spinner class="am-apply-spinner" />
                              </Show>
                              {t("agentManager.apply.globalButton")}
                            </Button>
                          </Tooltip>
                        </>
                      </Show>
                      <Show when={sel()}>
                        {(() => {
                          const rid = () => (sel() === LOCAL ? LOCAL : (sel() as string))
                          const rs = () => runStatuses()[rid()]
                          const active = () => rs()?.state === "running" || rs()?.state === "stopping"
                          const configured = runScriptConfigured
                          const title = () => (configured() ? (active() ? "Stop" : "Run") : "Configure run script")
                          return (
                            <span
                              class={`am-run-group ${active() ? "am-run-active" : ""} ${!configured() ? "am-run-unconfigured" : ""}`}
                            >
                              <TooltipKeybind title={title()} keybind={kb().runScript ?? ""} placement="bottom">
                                <Button
                                  size="small"
                                  variant="ghost"
                                  icon={active() ? "stop" : "play"}
                                  disabled={rs()?.state === "stopping"}
                                  onClick={() => runWorktree(rid())}
                                >
                                  {active() ? "Stop" : "Run"}
                                </Button>
                              </TooltipKeybind>
                              <DropdownMenu gutter={4} placement="bottom-end">
                                <DropdownMenu.Trigger
                                  as={(p: Record<string, unknown>) => (
                                    <IconButton
                                      {...p}
                                      icon="chevron-down"
                                      size="small"
                                      variant="ghost"
                                      label={t("agentManager.run.options")}
                                      class="am-run-group-chevron"
                                    />
                                  )}
                                />
                                <DropdownMenu.Portal>
                                  <DropdownMenu.Content class="am-split-menu">
                                    <DropdownMenu.Item onSelect={configureRunScript}>
                                      <Icon name="settings-gear" size="small" />
                                      <DropdownMenu.ItemLabel>{t("agentManager.run.configure")}</DropdownMenu.ItemLabel>
                                    </DropdownMenu.Item>
                                  </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                              </DropdownMenu>
                            </span>
                          )
                        })()}
                      </Show>
                      <TooltipKeybind
                        title={t("agentManager.diff.toggle")}
                        keybind={kb().toggleDiff ?? ""}
                        placement="bottom"
                      >
                        <button
                          class={`am-diff-toggle-btn ${diffOpen() && !reviewActive() ? "am-tab-diff-btn-active" : ""} ${hasChanges() ? "am-diff-toggle-has-changes" : ""}`}
                          onClick={() => {
                            if (reviewActive()) {
                              closeReviewTab()
                              setSidePanel("diff")
                              return
                            }
                            setSidePanel((prev) => (prev === "diff" ? null : "diff"))
                          }}
                          title={t("agentManager.diff.toggle")}
                        >
                          <Icon name="layers" size="small" />
                          <Show when={hasChanges()}>
                            <span class="am-diff-toggle-stats">
                              <Show when={stats()!.files > 0}>
                                <span class="am-stat-files">{stats()!.files}f</span>
                              </Show>
                              <span class="am-stat-additions">+{stats()!.additions}</span>
                              <span class="am-stat-deletions">−{stats()!.deletions}</span>
                            </span>
                          </Show>
                        </button>
                      </TooltipKeybind>
                    </>
                  )
                })()}
                <Show when={selection() !== null}>
                  <Tooltip value={t("command.review.toggle")} placement="bottom">
                    <IconButton
                      icon="expand"
                      size="small"
                      variant="ghost"
                      label={t("command.review.toggle")}
                      class={reviewActive() ? "am-tab-diff-btn-active" : ""}
                      onClick={toggleReviewTab}
                    />
                  </Tooltip>
                </Show>
                {/* Legacy VS Code integrated terminal shortcut. Coexists
                    with the xterm terminal tabs (accessed via the `+`
                    split-button or Cmd+Shift+T): Cmd+/ still opens the
                    integrated terminal for the active session. */}
                <TooltipKeybind
                  title={t("agentManager.tab.terminal")}
                  keybind={kb().showTerminal ?? ""}
                  placement="bottom"
                >
                  <IconButton
                    icon="console"
                    size="small"
                    variant="ghost"
                    label={t("agentManager.tab.openTerminal")}
                    onClick={() => {
                      const id = session.currentSessionID()
                      if (id) vscode.postMessage({ type: "agentManager.showTerminal", sessionId: id })
                      else if (selection() === LOCAL) vscode.postMessage({ type: "agentManager.showLocalTerminal" })
                    }}
                  />
                </TooltipKeybind>
              </div>
            </div>
            <DragOverlay>
              <Show when={draggedTab()}>
                {(tab) => (
                  <div class="am-tab am-tab-overlay">
                    <span class="am-tab-label">{tab().title || t("agentManager.session.untitled")}</span>
                  </div>
                )}
              </Show>
            </DragOverlay>
          </DragDropProvider>
        </Show>

        {/* Empty worktree state */}
        <Show when={contextEmpty()}>
          <div class="am-empty-state">
            <div class="am-empty-state-icon">
              <Icon name="branch" size="large" />
            </div>
            <div class="am-empty-state-text">{t("agentManager.session.noSessions")}</div>
            <Button variant="primary" size="small" onClick={handleAddSession}>
              {t("agentManager.session.new")}
              <span class="am-shortcut-hint">{kb().newTab ?? ""}</span>
            </Button>
          </div>
        </Show>

        {(() => {
          // Show setup overlay: either the transient ready/error state for the selected worktree,
          // or if the selected worktree is still being set up (from busyWorktrees map)
          const overlayState = (): SetupState | null => {
            const s = setup()
            const sel = selection()
            // Transient ready/error overlay for the selected worktree (or worktree-less setup)
            if (s.active && (!s.worktreeId || sel === s.worktreeId)) return s
            // Persistent setup-in-progress for the currently selected worktree
            if (typeof sel === "string" && sel !== LOCAL) {
              const busy = busyWorktrees().get(sel)
              if (busy?.reason === "setting-up") {
                const wt = worktrees().find((w) => w.id === sel)
                return {
                  active: true,
                  message: busy.message ?? "",
                  branch: busy.branch ?? wt?.branch,
                } satisfies SetupState
              }
            }
            return null
          }
          return (
            <Show when={overlayState()}>
              {(state) => (
                <div class="am-setup-overlay">
                  <div class="am-setup-card">
                    <Icon name="branch" size="large" />
                    <div class="am-setup-title">
                      {state().error ? t("agentManager.setup.failed") : t("agentManager.setup.settingUp")}
                    </div>
                    <Show when={state().branch}>
                      <div class="am-setup-branch">{state().branch}</div>
                    </Show>
                    <div class="am-setup-status">
                      <Show when={!state().error} fallback={<Icon name="circle-x" size="small" />}>
                        <Spinner class="am-setup-spinner" />
                      </Show>
                      <span>
                        {state().errorCode ? t(`agentManager.setup.error.${state().errorCode}`) : state().message}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          )
        })()}
        <Show when={history()}>
          <HistoryView
            onSelectSession={(id) => {
              setHistory(false)
              if (localSessionIDs().includes(id)) {
                saveTabMemory()
                session.selectSession(id)
                setSelection(LOCAL)
                return
              }
              const ms = worktreeSessionIds().has(id) ? managedSessions().find((s) => s.id === id) : undefined
              if (ms?.worktreeId) {
                selectWorktree(ms.worktreeId)
                session.selectSession(id)
                setReviewActive(false)
                return
              }
              openLocally(id)
            }}
            onBack={() => setHistory(false)}
          />
        </Show>
        <Show when={!contextEmpty() && !history()}>
          {/* Stacking container: the terminal layer is an absolutely-
              positioned overlay on top of the chat. This sub-container
              is position:relative so the overlay does not cover the
              tab bar above (which lives outside this stack). */}
          <div class="am-detail-stack">
            {/* Terminal tabs are kept mounted regardless of visibility so
                output keeps streaming across worktree switches without
                detaching xterm from the paint tree. */}
            {renderTerminalLayer({ state: terms })}
            {/* Chat + side diff panel (hidden when review tab or terminal tab is active) */}
            <div
              class={`am-detail-content ${sidePanel() !== null ? "am-detail-split" : ""}`}
              style={{ display: reviewActive() || terms.activeId() ? "none" : undefined }}
            >
              <div class="am-chat-wrapper">
                <ChatView
                  onSelectSession={(id) => {
                    if (localSessionIDs().includes(id)) {
                      session.selectSession(id)
                      if (selection() === null) setSelection(LOCAL)
                      return
                    }
                    // Navigate to owning worktree instead of forcing into local mode
                    if (worktreeSessionIds().has(id)) {
                      const ms = managedSessions().find((s) => s.id === id)
                      if (ms?.worktreeId) {
                        selectWorktree(ms.worktreeId)
                        session.selectSession(id)
                        setReviewActive(false)
                        return
                      }
                    }
                    openLocally(id)
                  }}
                  onShowHistory={() => setHistory(true)}
                  onForkMessage={readOnly() ? undefined : handleForkSession}
                  readonly={readOnly()}
                  continueInWorktree={selection() === LOCAL}
                  promptBoxId={`agent-manager:${selection() ?? "unassigned"}`}
                  pendingSessionID={selection() === LOCAL ? activePendingId() : undefined}
                />
                <Show when={readOnly()}>
                  <div class="am-readonly-banner">
                    <Icon name="branch" size="small" />
                    <span class="am-readonly-text">{t("agentManager.session.readonly")}</span>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => {
                        if (!loaded()) return
                        const sid = session.currentSessionID()
                        if (!sid) return
                        openLocally(sid)
                      }}
                    >
                      {t("agentManager.session.openLocally")}
                    </Button>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => {
                        if (!loaded()) return
                        const sid = session.currentSessionID()
                        if (sid) vscode.postMessage({ type: "agentManager.promoteSession", sessionId: sid })
                      }}
                    >
                      {t("agentManager.session.openInWorktree")}
                    </Button>
                  </div>
                </Show>
              </div>
              <Show when={sidePanel() !== null}>
                <div class="am-diff-resize" style={{ width: `${diffWidth()}px` }}>
                  <ResizeHandle
                    direction="horizontal"
                    edge="start"
                    size={diffWidth()}
                    min={200}
                    max={Math.round(window.innerWidth * 0.8)}
                    onResize={(w) => {
                      pendingDiffWidth = Math.max(200, Math.min(w, window.innerWidth * 0.8))
                      if (diffRaf === undefined) {
                        diffRaf = requestAnimationFrame(() => {
                          diffRaf = undefined
                          setDiffWidth(pendingDiffWidth!)
                        })
                      }
                    }}
                  />
                  <div class="am-diff-panel-wrapper">
                    <Show when={sidePanel() === "diff"}>
                      <DiffPanel
                        diffs={reviewDiffs()}
                        loading={diffLoading()}
                        loadingFiles={diffFileLoadingForCurrent()}
                        sessionId={currentDiffSessionId()}
                        sessionKey={diffSessionKey()}
                        diffStyle={reviewDiffStyle()}
                        onDiffStyleChange={setSharedDiffStyle}
                        comments={reviewComments()}
                        onCommentsChange={setReviewCommentsForSelection}
                        onClose={() => setSidePanel(null)}
                        onExpand={selection() !== null ? openReviewTab : undefined}
                        onRequestDiff={requestDiffFile}
                        onOpenFile={openFile}
                        onRevertFile={revertCtl.revert}
                        revertingFiles={revertCtl.reverting()}
                        eagerLoad={eagerLoad()}
                        instantComments={instantComments()}
                        onStartThread={startThread}
                      />
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
            {/* Full-screen review tab (lazy-mounted, stays alive once opened for fast toggle) */}
            <Show when={reviewOpen()}>
              <div class="am-review-host" style={{ display: reviewActive() && !terms.activeId() ? undefined : "none" }}>
                <FullScreenDiffView
                  diffs={reviewDiffs()}
                  loading={diffLoading()}
                  loadingFiles={diffFileLoadingForCurrent()}
                  sessionId={currentDiffSessionId()}
                  sessionKey={diffSessionKey()}
                  comments={reviewComments()}
                  onCommentsChange={setReviewCommentsForSelection}
                  onSendAll={closeReviewTab}
                  diffStyle={reviewDiffStyle()}
                  onDiffStyleChange={setSharedDiffStyle}
                  onRequestDiff={requestDiffFile}
                  onOpenFile={openFile}
                  onRevertFile={revertCtl.revert}
                  revertingFiles={revertCtl.reverting()}
                  onClose={closeReviewTab}
                  eagerLoad={eagerLoad()}
                  instantComments={instantComments()}
                  reviewThreads={reviewThreads()}
                  reviewSummary={reviewSummary()}
                  explaining={explainingDiffs()}
                  onExplainAll={() => {
                    setExplainingDiffs(true)
                    vscode.postMessage({
                      type: "diffViewer.explainAll",
                      worktreeId: selection() === LOCAL || selection() === null ? undefined : (selection() as string),
                    })
                  }}
                  onThreadReply={replyThread}
                  onStartThread={startThread}
                />
              </div>
            </Show>
          </div>
        </Show>
      </div>
  )

  return (
    <div class="am-layout" onContextMenu={(e) => e.preventDefault()}>
      {renderSidebar()}
      {renderDetail()}
    </div>
  )
}

export const AgentManagerApp: Component = () => {
  return (
    <ThemeProvider defaultTheme="strata-vscode">
      <DialogProvider>
        <VSCodeProvider>
          <ServerProvider>
            <LanguageBridge>
              <MarkedProvider>
                <DiffComponentProvider component={Diff}>
                  <CodeComponentProvider component={Code}>
                    <FileComponentProvider component={File}>
                      <ProviderProvider>
                        <ConfigProvider>
                          <NotificationsProvider>
                            <SessionProvider>
                              <IndexingProvider>
                                <WorktreeModeProvider>
                                  <DataBridge>
                                    <AgentManagerContent />
                                  </DataBridge>
                                </WorktreeModeProvider>
                              </IndexingProvider>
                            </SessionProvider>
                          </NotificationsProvider>
                        </ConfigProvider>
                      </ProviderProvider>
                    </FileComponentProvider>
                  </CodeComponentProvider>
                </DiffComponentProvider>
              </MarkedProvider>
            </LanguageBridge>
          </ServerProvider>
        </VSCodeProvider>
        <Toast.Region />
      </DialogProvider>
    </ThemeProvider>
  )
}
