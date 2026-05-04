import { Component, createMemo, createSignal, For, Show } from "solid-js"
import { PopupSelector } from "./PopupSelector"
import { Button } from "@stratacode/strata-ui/button"
import { Book } from "@stratacode/strata-ui/lucide"
import type { SlashCommandEntry } from "../../hooks/useSlashCommand"

export interface PromptLibrarySelectorProps {
  workflows: SlashCommandEntry[]
  onSelect: (workflow: SlashCommandEntry) => void
}

export const PromptLibrarySelector: Component<PromptLibrarySelectorProps> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [focused, setFocused] = createSignal(-1)
  const [query, setQuery] = createSignal("")
  let listRef: HTMLDivElement | undefined
  let searchRef: HTMLInputElement | undefined

  const filtered = createMemo(() => {
    const q = query().toLowerCase().trim()
    if (!q) return props.workflows
    return props.workflows.filter(
      (w) => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q),
    )
  })

  function pick(workflow: SlashCommandEntry) {
    props.onSelect(workflow)
    setOpen(false)
    setQuery("")
  }

  function focusItem(idx: number) {
    const items = listRef?.querySelectorAll<HTMLElement>("[role=option]")
    if (!items) return
    const clamped = Math.max(0, Math.min(idx, items.length - 1))
    setFocused(clamped)
    items[clamped]?.scrollIntoView({ block: "nearest" })
  }

  function onOpen(val: boolean) {
    setOpen(val)
    if (val) {
      setQuery("")
      setFocused(0)
      requestAnimationFrame(() => searchRef?.focus())
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    const len = filtered().length
    if (len === 0) return
    const cur = focused()
    if (e.key === "ArrowDown") {
      e.preventDefault()
      focusItem((cur + 1) % len)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      focusItem((cur - 1 + len) % len)
    } else if (e.key === "Home") {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === "End") {
      e.preventDefault()
      focusItem(len - 1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (cur >= 0 && cur < len) pick(filtered()[cur])
    }
  }

  return (
    <Show when={props.workflows.length > 0}>
      <PopupSelector
        expanded={false}
        placement="top-start"
        preferredWidth={260}
        preferredHeight={220}
        minHeight={80}
        open={open()}
        onOpenChange={onOpen}
        triggerAs={Button}
        triggerProps={{ variant: "ghost", size: "small" }}
        trigger={
          <>
            <Book size={16} />
          </>
        }
      >
        {(bodyH) => (
          <div class="prompt-library-popup" onKeyDown={onKeyDown}>
            <div class="prompt-library-search">
              <input
                ref={searchRef}
                type="text"
                class="prompt-library-search-input"
                placeholder="Search workflows…"
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value)
                  setFocused(0)
                }}
              />
            </div>
            <div
              class="mode-switcher-list"
              role="listbox"
              ref={listRef}
              style={bodyH() !== undefined ? { "max-height": `${bodyH()! - 38}px` } : {}}
            >
              <Show
                when={filtered().length > 0}
                fallback={<div class="prompt-library-empty">No workflows found</div>}
              >
                <For each={filtered()}>
                  {(workflow, i) => (
                    <div
                      class="mode-switcher-item"
                      classList={{ "mode-switcher-item--focused": focused() === i() }}
                      role="option"
                      tabindex={-1}
                      onClick={() => pick(workflow)}
                      onMouseEnter={() => setFocused(i())}
                    >
                      <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                        <span class="mode-switcher-item-name">/{workflow.name}</span>
                      </div>
                      <Show when={workflow.description}>
                        <span class="mode-switcher-item-desc">{workflow.description}</span>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        )}
      </PopupSelector>
    </Show>
  )
}
