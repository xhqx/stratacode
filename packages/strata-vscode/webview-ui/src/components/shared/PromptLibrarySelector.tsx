import { Component, createSignal, For, Show } from "solid-js"
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
  let listRef: HTMLDivElement | undefined

  function pick(workflow: SlashCommandEntry) {
    props.onSelect(workflow)
    setOpen(false)
  }

  function focusItem(idx: number) {
    const items = listRef?.querySelectorAll<HTMLElement>("[role=option]")
    if (!items) return
    const clamped = Math.max(0, Math.min(idx, items.length - 1))
    setFocused(clamped)
    items[clamped]?.focus()
  }

  function onOpen(val: boolean) {
    setOpen(val)
    if (val) {
      requestAnimationFrame(() => focusItem(0))
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    const len = props.workflows.length
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
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (cur >= 0 && cur < len) pick(props.workflows[cur])
    }
  }

  return (
    <Show when={props.workflows.length > 0}>
      <PopupSelector
        expanded={false}
        placement="top-start"
        minHeight={100}
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
          <div
            class="mode-switcher-list"
            role="listbox"
            ref={listRef}
            onKeyDown={onKeyDown}
            style={bodyH() !== undefined ? { "max-height": `${bodyH()}px` } : {}}
          >
            <For each={props.workflows}>
              {(workflow, i) => (
                <div
                  class="mode-switcher-item"
                  role="option"
                  tabindex={focused() === i() ? 0 : -1}
                  onClick={() => pick(workflow)}
                  onFocus={() => setFocused(i())}
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
          </div>
        )}
      </PopupSelector>
    </Show>
  )
}
