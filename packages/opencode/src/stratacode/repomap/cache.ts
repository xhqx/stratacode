import { Effect, Stream, Array } from "effect"
import { Ripgrep } from "@/file/ripgrep"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { ParserService, type Tag } from "./parser"
import { Log } from "@/util"
import { EXTENSIONS } from "./queries"
import path from "path"

const log = Log.create({ service: "repomap:cache" })

interface Entry {
  mtime: number
  tags: Tag[]
}

const store = new Map<string, Entry>()

export namespace CacheService {
  /**
   * Clears the cache for specific files, or the entire cache if no files are provided.
   */
  export const invalidate = (files?: string[]) =>
    Effect.sync(() => {
      if (!files) {
        store.clear()
        log.debug("cleared full cache")
        return
      }
      for (const file of files) {
        store.delete(file)
      }
      log.debug("invalidated files", { files })
    })

  // Hardcoded deny patterns for security/privacy
  const DENY_PATTERNS = [
    /\\.env.*/i,
    /\\.key$/i,
    /\\.pem$/i,
    /\\.p12$/i,
    /.*secret.*/i,
    /.*credentials.*/i,
    /\\.lock$/i,
    /.*lock\\.json$/i,
    /yarn\\.lock$/i,
    /bun\\.lockb$/i,
  ]

  const isDenied = (filepath: string) => DENY_PATTERNS.some((p) => p.test(filepath))

  /**
   * Discovers project files using Ripgrep and parses them if their mtime has changed.
   */
  export const sync = (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* AppFileSystem.Service
      const rg = yield* Ripgrep.Service

      // Ripgrep automatically respects .gitignore and ignores binary files (mostly)
      // We explicitly exclude .git/ and other common vendor dirs just in case,
      // though Ripgrep usually skips them if hidden or in .gitignore.
      const files = yield* rg
        .files({
          cwd,
          hidden: true,
          glob: ["!.git/*", "!node_modules/*", "!vendor/*", "!dist/*", "!build/*", "!**/.DS_Store"],
        })
        .pipe(Stream.runCollect)

      const updatedFiles: string[] = []

      for (const filepath of Array.fromIterable(files)) {
        // 1. Extension check
        const ext = filepath.substring(filepath.lastIndexOf(".")).toLowerCase()
        if (!EXTENSIONS[ext]) continue

        // 2. Deny list check
        if (isDenied(filepath)) continue

        // 3. Stat check (size and mtime)
        const absPath = path.join(cwd, filepath)

        const stat = yield* Effect.orElseSucceed(fs.stat(absPath), () => null)
        if (!stat) continue // file disappeared or unreadable

        if (stat.size > 100 * 1024) continue // Skip files > 100KB

        // 4. Cache mtime check
        const cached = store.get(filepath)
        const mtimeMs = stat.mtime._tag === "Some" ? stat.mtime.value.getTime() : 0
        if (cached && cached.mtime >= mtimeMs) {
          continue // Cache is fresh
        }

        // 5. Read and parse
        const contentBuffer = yield* Effect.orElseSucceed(fs.readFile(absPath), () => null)
        if (!contentBuffer) continue

        const content = Buffer.from(contentBuffer).toString("utf-8")
        const tags = yield* ParserService.extract(filepath, content)

        store.set(filepath, {
          mtime: mtimeMs,
          tags,
        })
        updatedFiles.push(filepath)
      }

      if (updatedFiles.length > 0) {
        log.info("sync complete", { updated: updatedFiles.length, totalCached: store.size })
      }

      return store
    })
}
