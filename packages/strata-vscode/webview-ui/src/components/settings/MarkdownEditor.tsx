import { Component, createSignal, Show } from "solid-js"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import { useLanguage } from "../../context/language"

interface Props {
  value: string
  placeholder?: string
  minHeight?: string
  onChange: (value: string) => void
}

// We use HTML buttons with text labels for markdown formatting since the available
// icon set doesn't include formatting-specific icons (bold, italic, heading, etc.).
// The preview/edit toggle uses the available eye/edit icons from the IconButton set.

interface Action {
  label: string
  titleKey: string
  apply: (text: string, start: number, end: number) => { text: string; cursor: number }
}

function wrap(text: string, start: number, end: number, prefix: string, suffix: string) {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)
  const result = `${before}${prefix}${selected || "text"}${suffix}${after}`
  const cursor = selected ? start + prefix.length + selected.length + suffix.length : start + prefix.length + 4
  return { text: result, cursor }
}

function prefixLines(text: string, start: number, end: number, marker: string) {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  // Find the start of the current line
  const lineStart = before.lastIndexOf("\n") + 1
  const linePrefix = before.slice(lineStart)

  // Prefix each line in the selection
  const lines = (linePrefix + selected).split("\n")
  const prefixed = lines.map((l) => `${marker}${l}`).join("\n")

  const result = before.slice(0, lineStart) + prefixed + after
  const cursor = result.length - after.length
  return { text: result, cursor }
}

const ACTIONS: Action[] = [
  {
    label: "B",
    titleKey: "markdown.bold",
    apply: (t, s, e) => wrap(t, s, e, "**", "**"),
  },
  {
    label: "I",
    titleKey: "markdown.italic",
    apply: (t, s, e) => wrap(t, s, e, "_", "_"),
  },
  {
    label: "<>",
    titleKey: "markdown.code",
    apply: (t, s, e) => wrap(t, s, e, "`", "`"),
  },
  {
    label: "```",
    titleKey: "markdown.codeBlock",
    apply: (t, s, e) => wrap(t, s, e, "\n```\n", "\n```\n"),
  },
  {
    label: "H",
    titleKey: "markdown.heading",
    apply: (t, s, e) => prefixLines(t, s, e, "## "),
  },
  {
    label: "•",
    titleKey: "markdown.list",
    apply: (t, s, e) => prefixLines(t, s, e, "- "),
  },
  {
    label: "1.",
    titleKey: "markdown.orderedList",
    apply: (t, s, e) => prefixLines(t, s, e, "1. "),
  },
  {
    label: "🔗",
    titleKey: "markdown.link",
    apply: (t, s, e) => {
      const before = t.slice(0, s)
      const selected = t.slice(s, e)
      const after = t.slice(e)
      const text = selected || "text"
      const result = `${before}[${text}](url)${after}`
      return { text: result, cursor: before.length + text.length + 3 }
    },
  },
]

const MarkdownEditor: Component<Props> = (props) => {
  const language = useLanguage()
  const [preview, setPreview] = createSignal(false)
  let ref: HTMLTextAreaElement | undefined

  const apply = (action: Action) => {
    const el = ref
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const result = action.apply(el.value, start, end)
    props.onChange(result.text)
    // Restore cursor after SolidJS re-renders the value
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(result.cursor, result.cursor)
    })
  }

  // Simple markdown → HTML for preview (covers the basics)
  const rendered = () => {
    const raw = props.value || ""
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/^\d+\.\s(.+)$/gm, "<li>$1</li>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, "<br/>")
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!ref) return
    // Tab inserts 2 spaces instead of moving focus
    if (e.key === "Tab") {
      e.preventDefault()
      const start = ref.selectionStart
      const end = ref.selectionEnd
      const val = ref.value
      const next = `${val.slice(0, start)}  ${val.slice(end)}`
      props.onChange(next)
      requestAnimationFrame(() => {
        ref!.focus()
        ref!.setSelectionRange(start + 2, start + 2)
      })
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--border-weak-base, var(--vscode-input-border))",
        "border-radius": "4px",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "2px",
          padding: "4px 6px",
          "border-bottom": "1px solid var(--border-weak-base, var(--vscode-input-border))",
          background: "var(--bg-subtle-base, var(--vscode-editorWidget-background))",
          "flex-wrap": "wrap",
        }}
      >
        {ACTIONS.map((action) => (
          <button
            type="button"
            title={language.t(action.titleKey)}
            onClick={() => apply(action)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-base, var(--vscode-foreground))",
              cursor: "pointer",
              padding: "2px 6px",
              "border-radius": "3px",
              "font-size": "12px",
              "font-weight": action.label === "B" ? "700" : action.label === "I" ? "400" : "500",
              "font-style": action.label === "I" ? "italic" : "normal",
              "font-family":
                action.label === "<>" || action.label === "```"
                  ? "var(--vscode-editor-font-family, monospace)"
                  : "inherit",
              "line-height": "20px",
              "min-width": "24px",
              "text-align": "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover-base, var(--vscode-list-hoverBackground))"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none"
            }}
          >
            {action.label}
          </button>
        ))}
        <div style={{ "margin-left": "auto" }}>
          <IconButton
            size="small"
            variant="ghost"
            icon={preview() ? "edit" : "eye"}
            title={language.t(preview() ? "markdown.edit" : "markdown.preview")}
            onClick={() => setPreview((v) => !v)}
          />
        </div>
      </div>

      {/* Editor / Preview */}
      <Show
        when={!preview()}
        fallback={
          <div
            style={{
              padding: "8px 12px",
              "min-height": props.minHeight ?? "200px",
              "max-height": "400px",
              "overflow-y": "auto",
              "font-size": "13px",
              "line-height": "1.5",
              color: "var(--text-base, var(--vscode-foreground))",
              "word-break": "break-word",
            }}
            innerHTML={rendered()}
          />
        }
      >
        <textarea
          ref={ref}
          value={props.value}
          placeholder={props.placeholder}
          spellcheck={false}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            "min-height": props.minHeight ?? "200px",
            "max-height": "400px",
            padding: "8px 12px",
            border: "none",
            outline: "none",
            resize: "vertical",
            "font-family": "var(--vscode-editor-font-family, monospace)",
            "font-size": "13px",
            "line-height": "1.5",
            color: "var(--text-base, var(--vscode-foreground))",
            background: "var(--bg-base, var(--vscode-input-background))",
            "box-sizing": "border-box",
            "tab-size": "2",
          }}
        />
      </Show>
    </div>
  )
}

export default MarkdownEditor
