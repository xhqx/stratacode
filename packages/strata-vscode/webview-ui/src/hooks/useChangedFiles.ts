/**
 * useChangedFiles
 * Reactively derives the list of files the AI has modified during the current
 * session by scanning completed edit/write tool parts for their `filediff`
 * metadata. Multiple edits to the same file are merged.
 */

import { createMemo } from "solid-js"
import { useSession } from "../context/session"
import { dirName, fileName } from "../components/chat/prompt-input-utils"

export interface ChangedFile {
  path: string
  dir: string
  name: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

interface FileDiffEntry {
  file: string
  additions?: number
  deletions?: number
  status?: string
}

interface FileDiffMeta {
  filediff?: FileDiffEntry
  files?: FileDiffEntry[]
}

const EDIT_TOOLS = new Set(["edit", "write", "apply_patch"])

export function useChangedFiles() {
  const session = useSession()

  const files = createMemo(() => {
    const parts = session.allParts()
    const msgs = session.messages()

    // Ordered list of file paths for stable display (most-recently-seen last)
    const order: string[] = []
    const map = new Map<string, ChangedFile>()

    for (const msg of msgs) {
      const msgParts = parts[msg.id]
      if (!msgParts) continue
      for (const part of msgParts) {
        if (part.type !== "tool") continue
        if (!EDIT_TOOLS.has(part.tool)) continue
        if (part.state.status !== "completed") continue

        // The webview ToolState type omits `metadata`, but the runtime payload
        // from the extension carries it. Cast through unknown to access it safely.
        const meta = (part.state as unknown as { metadata?: FileDiffMeta }).metadata
        if (!meta) continue

        // edit + write tools store a single filediff
        if (meta.filediff?.file) {
          merge(map, order, meta.filediff)
          continue
        }

        // apply_patch stores an array of per-file diffs
        if (Array.isArray(meta.files)) {
          for (const fd of meta.files) {
            if (fd?.file) merge(map, order, fd)
          }
        }
      }
    }

    // Return in insertion order (most recently edited last → show at top by reversing)
    return order
      .slice()
      .reverse()
      .map((p) => map.get(p)!)
  })

  return { files }
}

function merge(map: Map<string, ChangedFile>, order: string[], fd: FileDiffEntry) {
  const path = fd.file
  const adds = fd.additions ?? 0
  const dels = fd.deletions ?? 0
  const status = (fd.status as ChangedFile["status"]) ?? "modified"
  const existing = map.get(path)
  if (existing) {
    existing.additions += adds
    existing.deletions += dels
    // Escalate status: modified < added/deleted
    if (status !== "modified") existing.status = status
    // Move to end of order so it sorts to top after reverse
    const idx = order.indexOf(path)
    if (idx !== -1) order.splice(idx, 1)
    order.push(path)
  } else {
    order.push(path)
    map.set(path, {
      path,
      dir: dirName(path),
      name: fileName(path),
      additions: adds,
      deletions: dels,
      status,
    })
  }
}
