import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs"
import type { ReviewThread } from "./review-thread"

export interface ThreadMeta {
  type: "thread"
  thread: ReviewThread
}

export function buildThreadAnnotations(file: string, items: ReviewThread[]): DiffLineAnnotation<ThreadMeta>[] {
  return items
    .filter((a) => a.file === file)
    .map((a) => ({
      side: a.side,
      lineNumber: a.line,
      metadata: {
        type: "thread" as const,
        thread: a,
      },
    }))
}

/**
 * Renders a review thread using the same DOM structure as the existing
 * comment annotations (`am-annotation`, `am-annotation-comment`, etc.)
 * with an added reply input at the bottom.
 */
export function buildThreadElement(meta: ThreadMeta, onReply: (threadId: string, text: string) => void): HTMLElement {
  const wrapper = document.createElement("div")
  wrapper.className = "am-annotation am-annotation-thread"

  // Render each message in the thread
  for (const msg of meta.thread.messages) {
    const block = document.createElement("div")
    block.className = "am-annotation-comment"

    // Author label with role-specific class
    const author = document.createElement("div")
    const cls = msg.author === "ai" ? "am-annotation-comment-author am-annotation-comment-author-ai" : "am-annotation-comment-author"
    author.className = cls
    author.textContent = msg.author === "ai" ? "Explainer" : "You"
    block.appendChild(author)

    // Comment text
    const text = document.createElement("div")
    text.className = "am-annotation-comment-text"
    text.innerHTML = format(msg.text)
    block.appendChild(text)

    wrapper.appendChild(block)
  }

  // Reply section
  const pending = meta.thread.pending
  const reply = document.createElement("div")
  reply.className = "am-annotation-comment"

  const textarea = document.createElement("textarea")
  textarea.className = "am-annotation-textarea"
  textarea.rows = 1
  textarea.placeholder = "Reply…"
  textarea.disabled = pending

  const actions = document.createElement("div")
  actions.className = "am-annotation-actions"

  const submit = document.createElement("button")
  submit.className = "am-annotation-btn am-annotation-btn-submit"
  submit.textContent = pending ? "Replying…" : "Reply"
  submit.disabled = pending

  const send = () => {
    const val = textarea.value.trim()
    if (!val || pending) return
    onReply(meta.thread.id, val)
    textarea.value = ""
  }

  submit.addEventListener("click", (e) => {
    e.stopPropagation()
    send()
  })

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  })

  actions.appendChild(submit)
  reply.appendChild(textarea)
  reply.appendChild(actions)
  wrapper.appendChild(reply)

  return wrapper
}

function format(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
}
