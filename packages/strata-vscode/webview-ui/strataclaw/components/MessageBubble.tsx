// Individual chat message bubble

import { Show, createMemo } from "solid-js"
import { Markdown } from "@stratacode/strata-ui/markdown"
import { TextShimmer } from "@stratacode/strata-ui/text-shimmer"
import type { ChatMessage } from "../lib/types"
import { useStrataClawLanguage } from "../context/language"

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function MessageBubble(props: { message: ChatMessage }) {
  const { t } = useStrataClawLanguage()
  const empty = createMemo(() => !props.message.text || !props.message.text.trim())

  return (
    <div class={`strataclaw-msg ${props.message.bot ? "strataclaw-msg-bot" : "strataclaw-msg-user"}`}>
      <div class="strataclaw-msg-header">
        <span class="strataclaw-msg-author">
          {props.message.bot ? t("strataClaw.message.bot") : t("strataClaw.message.you")}
        </span>
        <span class="strataclaw-msg-time">{formatTime(props.message.created)}</span>
      </div>
      <div class="strataclaw-msg-body">
        <Show when={!empty()} fallback={<TextShimmer text={t("strataClaw.message.thinking")} />}>
          <Show when={props.message.bot} fallback={<span>{props.message.text}</span>}>
            <Markdown text={props.message.text} />
          </Show>
        </Show>
      </div>
    </div>
  )
}
