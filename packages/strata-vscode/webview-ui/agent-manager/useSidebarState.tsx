import { createSignal } from "solid-js"
import type { SectionState } from "../src/types/messages"
import { LOCAL } from "./navigate"

export type SidebarSelection = typeof LOCAL | string | null

export interface UseSidebarStateOptions {
  persistedWidth?: number
  defaultWidth: number
  visibleTabId: () => string | undefined
}

export function useSidebarState(opts: UseSidebarStateOptions) {
  const [selection, setSelection] = createSignal<SidebarSelection>(LOCAL)
  const [sidebarWidth, setSidebarWidth] = createSignal(opts.persistedWidth ?? opts.defaultWidth)
  const [sessionsCollapsed, setSessionsCollapsed] = createSignal(false)
  const [sections, setSections] = createSignal<SectionState[]>([])
  const [history, setHistory] = createSignal(false)
  const [tabMemory, setTabMemory] = createSignal<Record<string, string>>({})
  const [sidebarWorktreeOrder, setSidebarWorktreeOrder] = createSignal<string[]>([])
  const [renamingSection, setRenamingSection] = createSignal<string | null>(null)
  const [draggingWorktree, setDraggingWorktree] = createSignal<string | undefined>()

  const saveTabMemory = () => {
    const sel = selection()
    if (sel === null) return
    const key = sel === LOCAL ? LOCAL : sel
    const visible = opts.visibleTabId()
    if (visible) {
      setTabMemory((prev) => (prev[key] === visible ? prev : { ...prev, [key]: visible }))
    }
  }

  return {
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
  }
}
