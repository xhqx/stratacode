export type HoverCommentLine = {
  lineNumber: number
  side?: "additions" | "deletions"
}

export function createHoverCommentUtility(props: {
  label: string
  getHoveredLine: () => HoverCommentLine | undefined
  onSelect: (line: HoverCommentLine) => void
}) {
  if (typeof document === "undefined") return

  const button = document.createElement("button")
  button.type = "button"
  button.ariaLabel = props.label
  button.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7 2v5H2v2h5v5h2V9h5V7H9V2z"/></svg>`
  button.style.width = "20px"
  button.style.height = "20px"
  button.style.display = "flex"
  button.style.alignItems = "center"
  button.style.justifyContent = "center"
  button.style.border = "none"
  button.style.borderRadius = "var(--radius-md)"
  // stratacode_change start
  button.style.background = "#EE9284"
  button.style.color = "#A4ADB6"
  // stratacode_change end
  button.style.boxShadow = "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.12))"
  button.style.fontSize = "14px"
  button.style.lineHeight = "1"
  button.style.cursor = "pointer"
  button.style.position = "relative"
  button.style.left = "30px"
  button.style.top = "calc((var(--diffs-line-height, 24px) - 20px) / 2)"

  let line: HoverCommentLine | undefined

  const sync = () => {
    const next = props.getHoveredLine()
    if (!next) return
    line = next
  }

  const loop = () => {
    if (!button.isConnected) return
    sync()
    requestAnimationFrame(loop)
  }

  const open = () => {
    const next = props.getHoveredLine() ?? line
    if (!next) return
    props.onSelect(next)
  }

  requestAnimationFrame(loop)
  button.addEventListener("mouseenter", sync)
  button.addEventListener("mousemove", sync)
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault()
    event.stopPropagation()
    sync()
  })
  button.addEventListener("mousedown", (event) => {
    event.preventDefault()
    event.stopPropagation()
    sync()
  })
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    open()
  })

  return button
}
