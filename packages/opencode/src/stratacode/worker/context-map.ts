// stratacode_change - new file
import { Log } from "@/util"
import path from "path"
import fs from "fs"

const log = Log.create({ service: "worker:context-map" })

export interface ReviewEntry {
  file: string
  hash: string
  summary: string
  intent?: string
  ts: number
}

export interface ContextMap {
  updated: number
  reviews: ReviewEntry[]
  summarized_files: Record<string, string>

  // Tiered summaries
  big?: string
  medium?: string
  small?: string

  // Legacy fields (populated from medium for backward compatibility)
  summary?: string
  recent_commits?: string[]
  session_titles?: string[]

  // Invalidation hashes
  source_hash?: string
}

const MAX_ENTRIES = 50

const getMapPath = () => path.join(".stratacode", "memory", "context_map.json")

// Simple in-memory lock for serialized writes per process
let writeLock = Promise.resolve()

export namespace ContextMapService {
  export const read = async (cwd: string): Promise<ContextMap> => {
    const absPath = path.join(cwd, getMapPath())
    try {
      const content = await fs.promises.readFile(absPath, "utf-8")
      const json = JSON.parse(content) as Partial<ContextMap>
      return {
        updated: json.updated ?? Date.now(),
        reviews: Array.isArray(json.reviews) ? json.reviews : [],
        summarized_files: json.summarized_files ?? {},
        summary: json.summary,
        recent_commits: json.recent_commits,
        session_titles: json.session_titles,
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        log.warn("context_map.json parsing failed, starting fresh", { err })
      }
      return { updated: Date.now(), reviews: [], summarized_files: {} }
    }
  }

  export const write = async (cwd: string, map: ContextMap): Promise<void> => {
    writeLock = writeLock
      .then(async () => {
        await writeRaw(cwd, map)
      })
      .catch((err) => {
        log.error("context_map.json write failed", { err })
      })

    return writeLock
  }

  export const inject = async (prompt: string, cwd: string): Promise<string> => {
    const map = await read(cwd)
    if (!map.summary) return prompt

    return `## Developer Context (from background analysis)\n\n${map.summary}\n\n${prompt}`
  }

  /**
   * Safely merges a partial update into the ContextMap, preventing concurrent clobbering.
   */
  export const merge = async (cwd: string, patch: Partial<ContextMap>): Promise<void> => {
    writeLock = writeLock
      .then(async () => {
        const current = await read(cwd)
        const merged: ContextMap = {
          ...current,
          ...patch,
          updated: Date.now(),
        }
        await writeRaw(cwd, merged)
      })
      .catch((err) => {
        log.error("context_map.json merge failed", { err })
      })

    return writeLock
  }

  // Internal write implementation used by both write() and merge()
  const writeRaw = async (cwd: string, map: ContextMap): Promise<void> => {
    const absPath = path.join(cwd, getMapPath())

    // Prune old entries
    if (map.reviews.length > MAX_ENTRIES) {
      map.reviews = map.reviews.sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES)
    }

    map.updated = Date.now()

    const data = JSON.stringify(map, null, 2)

    // Atomic write
    const tempPath = `${absPath}.tmp.${Date.now()}`
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true }).catch(() => null)
    await fs.promises.writeFile(tempPath, data, "utf-8")
    await fs.promises.rename(tempPath, absPath)
  }

  export const unsummarized = (map: ContextMap): ReviewEntry[] => {
    return map.reviews.filter((r) => map.summarized_files[r.file] !== r.hash)
  }
}
