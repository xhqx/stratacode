// stratacode_change - new file
import { Log } from "@/util"
import path from "path"
import fs from "fs"

const log = Log.create({ service: "worker:doc-manifest" })

export interface DocPageMeta {
  id: string
  path: string
  title: string
  status: "pending" | "generating" | "ready" | "stale" | "error"
  symbols: number
  generated: string
  hash: string
  error?: string
}

export interface DocManifest {
  version: number
  generated: string
  pages: DocPageMeta[]
}

const getMapPath = () => path.join(".stratacode", "docs", "manifest.json")

// Simple in-memory lock for serialized writes per process
let writeLock = Promise.resolve()

export namespace DocManifestService {
  export const read = async (cwd: string): Promise<DocManifest> => {
    const absPath = path.join(cwd, getMapPath())
    try {
      const content = await fs.promises.readFile(absPath, "utf-8")
      const json = JSON.parse(content) as Partial<DocManifest>
      return {
        version: json.version ?? 1,
        generated: json.generated ?? new Date().toISOString(),
        pages: Array.isArray(json.pages) ? json.pages : [],
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        log.warn("docs manifest.json parsing failed, starting fresh", { err })
      }
      return { version: 1, generated: new Date().toISOString(), pages: [] }
    }
  }

  export const write = async (cwd: string, map: DocManifest): Promise<void> => {
    writeLock = writeLock
      .then(async () => {
        await writeRaw(cwd, map)
      })
      .catch((err) => {
        log.error("docs manifest.json write failed", { err })
      })

    return writeLock
  }

  /**
   * Safely merges a partial update into the DocManifest, preventing concurrent clobbering.
   */
  export const merge = async (cwd: string, patch: Partial<DocManifest>): Promise<void> => {
    writeLock = writeLock
      .then(async () => {
        const current = await read(cwd)
        const merged: DocManifest = {
          ...current,
          ...patch,
          // If pages are provided in patch, we merge them by ID
          pages: patch.pages ? mergePages(current.pages, patch.pages) : current.pages,
          generated: new Date().toISOString(),
        }
        await writeRaw(cwd, merged)
      })
      .catch((err) => {
        log.error("docs manifest.json merge failed", { err })
      })

    return writeLock
  }

  // Internal write implementation used by both write() and merge()
  const writeRaw = async (cwd: string, map: DocManifest): Promise<void> => {
    const absPath = path.join(cwd, getMapPath())

    map.generated = new Date().toISOString()

    const data = JSON.stringify(map, null, 2)

    // Atomic write
    const tempPath = `${absPath}.tmp.${Date.now()}`
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true }).catch(() => null)
    await fs.promises.writeFile(tempPath, data, "utf-8")
    await fs.promises.rename(tempPath, absPath)
  }

  const mergePages = (current: DocPageMeta[], incoming: DocPageMeta[]): DocPageMeta[] => {
    const map = new Map(current.map((p) => [p.id, p]))
    for (const page of incoming) {
      map.set(page.id, { ...map.get(page.id), ...page })
    }
    return Array.from(map.values())
  }
}
