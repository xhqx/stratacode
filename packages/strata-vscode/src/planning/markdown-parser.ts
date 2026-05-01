import * as fs from "node:fs"
import * as path from "node:path"

export interface MarkdownPage {
  path: string
  title: string
  links: string[]
  tasks: MarkdownTask[]
}

export interface MarkdownTask {
  id: string
  line: number
  checked: boolean
  inProgress: boolean
  title: string
  description: string
  file: string
  group: string
  meta: TaskMeta
}

export interface TaskMeta {
  agent?: string
  priority?: number
  depends?: string[]
  provider?: string
  model?: string
}

const CHECKBOX_RE = /^(\s*[-*+]\s+)\[([ xX/])\]\s+(.*)$/
const STRATA_COMMENT_RE = /^\s*<!--\s*strata:\s*(.*?)\s*-->\s*$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LINK_RE = /\[([^\]]*)\]\(([^)]+\.md(?:#[^)]*)?)\)/g

export function parsePage(content: string, file: string): MarkdownPage {
  const lines = content.split("\n")
  const page: MarkdownPage = { path: file, title: "", links: [], tasks: [] }

  let group = ""
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Track headings
    const heading = line.match(HEADING_RE)
    if (heading) {
      const level = heading[1]!.length
      const text = heading[2]!.trim()
      if (level === 1 && !page.title) {
        page.title = text
      }
      group = text
      i++
      continue
    }

    // Extract markdown links to other .md files
    let match: RegExpExecArray | null
    LINK_RE.lastIndex = 0
    while ((match = LINK_RE.exec(line)) !== null) {
      const href = match[2]!
      if (!href.startsWith("http") && href.endsWith(".md")) {
        page.links.push(href)
      }
    }

    // Parse checkbox tasks
    const checkbox = line.match(CHECKBOX_RE)
    if (checkbox) {
      const state = checkbox[2]!
      const title = checkbox[3]!.trim()
      const taskLine = i + 1 // 1-based
      const checked = state.toLowerCase() === "x"
      const progress = state === "/"

      // Look ahead for strata comment and description
      const { meta, description, consumed } = parseTaskBody(lines, i + 1)

      const id = meta.id ?? generateId(title, file)
      delete (meta as Record<string, unknown>).id

      page.tasks.push({
        id,
        line: taskLine,
        checked,
        inProgress: progress,
        title,
        description,
        file,
        group,
        meta,
      })

      i += 1 + consumed
      continue
    }

    i++
  }

  return page
}

function parseTaskBody(lines: string[], start: number): { meta: TaskMeta & { id?: string }; description: string; consumed: number } {
  const meta: TaskMeta & { id?: string } = {}
  const desc: string[] = []
  let consumed = 0

  for (let j = start; j < lines.length; j++) {
    const line = lines[j]!

    // Stop at next checkbox or non-indented non-empty line (except strata comments)
    if (CHECKBOX_RE.test(line)) break
    if (line.trim() === "") {
      // Empty line within task body — check if next line is still indented
      if (j + 1 < lines.length && /^\s{2,}/.test(lines[j + 1]!)) {
        desc.push("")
        consumed++
        continue
      }
      break
    }

    // Non-indented line that's not a strata comment stops the task body
    if (!/^\s{2,}/.test(line) && !STRATA_COMMENT_RE.test(line)) break

    const comment = line.match(STRATA_COMMENT_RE)
    if (comment) {
      parseStrataComment(comment[1]!, meta)
      consumed++
      continue
    }

    desc.push(line.trim())
    consumed++
  }

  return { meta, description: desc.join("\n").trim(), consumed }
}

function parseStrataComment(raw: string, meta: TaskMeta & { id?: string }) {
  // Parse key=value pairs — supports key=value and key="quoted value"
  const pairs = raw.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)
  for (const pair of pairs) {
    const key = pair[1]!
    const val = pair[2] ?? pair[3]!
    switch (key) {
      case "agent":
        meta.agent = val
        break
      case "priority":
        meta.priority = parseInt(val, 10) || undefined
        break
      case "depends":
        meta.depends = val.split(",").map((d) => d.trim()).filter(Boolean)
        break
      case "provider":
        meta.provider = val
        break
      case "model":
        meta.model = val
        break
      case "id":
        meta.id = val
        break
    }
  }
}

export function updateCheckbox(content: string, line: number, state: " " | "x" | "/"): string {
  const lines = content.split("\n")
  const idx = line - 1 // convert to 0-based
  if (idx < 0 || idx >= lines.length) return content

  const target = lines[idx]!
  const match = target.match(CHECKBOX_RE)
  if (!match) return content

  const prefix = match[1]!
  const rest = match[3]!
  lines[idx] = `${prefix}[${state}] ${rest}`
  return lines.join("\n")
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function hash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

export function generateId(title: string, file: string): string {
  const slug = slugify(title)
  const suffix = hash(file).slice(0, 6)
  return `${slug}-${suffix}`
}

export async function scanPlanDirectory(root: string): Promise<MarkdownPage[]> {
  const dir = path.join(root, ".strata", "plans")
  const exists = await fs.promises.access(dir).then(() => true).catch(() => false)
  if (!exists) return []

  const pages: MarkdownPage[] = []
  await walk(dir, dir, pages)
  return pages
}

async function walk(base: string, dir: string, pages: MarkdownPage[]): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(base, full, pages)
    } else if (entry.name.endsWith(".md")) {
      const content = await fs.promises.readFile(full, "utf-8")
      const page = parsePage(content, full)
      pages.push(page)
    }
  }
}
