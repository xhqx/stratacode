import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs"

export interface ExplainAnnotation {
  id: string
  file: string
  side: AnnotationSide
  line: number
  text: string
}

export interface ExplainMeta {
  type: "explanation"
  id: string
  file: string
  side: AnnotationSide
  line: number
  text: string
}

export function buildExplainAnnotations(file: string, items: ExplainAnnotation[]): DiffLineAnnotation<ExplainMeta>[] {
  return items
    .filter((a) => a.file === file)
    .map((a) => ({
      side: a.side,
      lineNumber: a.line,
      metadata: {
        type: "explanation" as const,
        id: a.id,
        file: a.file,
        side: a.side,
        line: a.line,
        text: a.text,
      },
    }))
}

function icon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("width", "14")
  svg.setAttribute("height", "14")
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("fill", "currentColor")
  const path = document.createElementNS(ns, "path")
  // Lightbulb icon (codicon: lightbulb)
  path.setAttribute(
    "d",
    "M11.5 8.5c0 .3-.1.5-.2.7l-.5.8c-.2.3-.3.6-.4 1H5.6c-.1-.4-.2-.7-.4-1l-.5-.8c-.1-.2-.2-.4-.2-.7C4.5 6.6 6 5 8 5s3.5 1.6 3.5 3.5zM6 12.5h4v.5c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1v-.5zM8 3.5c-2.8 0-5 2.2-5 5 0 .6.2 1.2.5 1.7l.5.8c.2.3.3.7.4 1 .1.5.5.8 1 .9v.6c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2v-.6c.5-.1.9-.4 1-.9.1-.3.2-.7.4-1l.5-.8c.3-.5.5-1.1.5-1.7 0-2.8-2.2-5-5-5z",
  )
  svg.appendChild(path)
  return svg
}

export function buildExplanationElement(meta: ExplainMeta, onDismiss: (id: string) => void): HTMLElement {
  const wrapper = document.createElement("div")
  wrapper.className = "am-annotation am-annotation-explanation"

  const label = document.createElement("span")
  label.className = "am-annotation-explanation-label"
  label.appendChild(icon())

  // Body: formatted explanation text
  const body = document.createElement("div")
  body.className = "am-annotation-explanation-body"
  body.innerHTML = format(meta.text)

  const dismiss = document.createElement("button")
  dismiss.className = "am-annotation-icon-btn am-annotation-explanation-dismiss"
  dismiss.title = "Dismiss"
  dismiss.textContent = "×"
  dismiss.addEventListener("click", (e) => {
    e.stopPropagation()
    onDismiss(meta.id)
  })

  wrapper.appendChild(label)
  wrapper.appendChild(body)
  wrapper.appendChild(dismiss)
  return wrapper
}

/**
 * Lightweight text formatter for explanation annotations.
 * Supports **bold**, *italic*, and line breaks — nothing else.
 */
function format(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>")
}
