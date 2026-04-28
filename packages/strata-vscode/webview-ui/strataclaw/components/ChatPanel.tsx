// StrataClaw chat panel — message list + input

import { createSignal, createEffect, For, Show, createMemo, onMount } from "solid-js"
import { Button } from "@stratacode/strata-ui/button"
import { useClaw } from "../context/claw"
import { useStrataClawLanguage } from "../context/language"
import { MessageBubble } from "./MessageBubble"

export function ChatPanel() {
  const claw = useClaw()
  const { t } = useStrataClawLanguage()
  const [text, setText] = createSignal("")
  let list!: HTMLDivElement
  let input!: HTMLTextAreaElement

  const disabled = createMemo(() => {
    const s = claw.status()
    return !s || s.status !== "running" || !claw.connected()
  })

  const placeholder = createMemo(() => {
    if (!claw.connected()) return t("strataClaw.chat.connecting")
    const s = claw.status()
    if (!s || s.status !== "running") return t("strataClaw.chat.notRunning")
    return t("strataClaw.chat.placeholder")
  })

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    claw.messages()
    if (list) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight
      })
    }
  })

  // Focus input on mount
  onMount(() => {
    if (input && !disabled()) input.focus()
  })

  const submit = () => {
    const val = text().trim()
    if (!val || disabled()) return
    claw.send(val)
    setText("")
    if (input) {
      input.style.height = "auto"
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const onInput = (e: InputEvent) => {
    const target = e.target as HTMLTextAreaElement
    setText(target.value)
    // Auto-resize
    target.style.height = "auto"
    target.style.height = Math.min(target.scrollHeight, 120) + "px"
  }

  return (
    <div class="strataclaw-chat">
      {/* Header */}
      <div class="strataclaw-chat-header">
        <div class="strataclaw-chat-header-left">
          <span class={`strataclaw-dot ${claw.online() ? "strataclaw-dot-online" : "strataclaw-dot-offline"}`} />
          <span class="strataclaw-chat-header-title">
            StrataClaw {claw.online() ? t("strataClaw.chat.online") : t("strataClaw.chat.offline")}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div class="strataclaw-messages" ref={list} role="log" aria-live="polite">
        <Show when={claw.messages().length === 0 && claw.connected()}>
          <div class="strataclaw-empty">{t("strataClaw.chat.empty")}</div>
        </Show>
        <For each={claw.messages()}>{(msg) => <MessageBubble message={msg} />}</For>
      </div>

      {/* Input */}
      <div class="strataclaw-input-wrap">
        <textarea
          ref={input}
          class="strataclaw-input"
          placeholder={placeholder()}
          disabled={disabled()}
          value={text()}
          onInput={onInput}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label={t("strataClaw.chat.placeholder")}
        />
        <Button variant="primary" disabled={disabled() || !text().trim()} onClick={submit}>
          {t("strataClaw.chat.send")}
        </Button>
      </div>
    </div>
  )
}
