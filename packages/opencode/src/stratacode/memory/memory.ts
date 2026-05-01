import { Context, Effect, Layer } from "effect"
import * as path from "node:path"
import * as fs from "node:fs/promises"
import { Instance } from "../../project/instance"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"

export interface MemoryEntry {
  id: string
  title: string
  content: string
}

export interface Interface {
  readonly list: () => Effect.Effect<MemoryEntry[]>
  readonly get: (id: string) => Effect.Effect<MemoryEntry | null>
  readonly add: (id: string, title: string, content: string) => Effect.Effect<void>
  readonly delete: (id: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@stratacode/MemoryService") {}

export const defaultLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsService = yield* AppFileSystem.Service

    const getMemoryDir = () => path.join(Instance.worktree, ".stratacode", "memory")

    const ensureDir = () =>
      Effect.tryPromise(async () => {
        const dir = getMemoryDir()
        await fs.mkdir(dir, { recursive: true })
      }).pipe(Effect.catch(() => Effect.void))

    return Service.of({
      list: () =>
        Effect.gen(function* () {
          yield* ensureDir()
          const dir = getMemoryDir()

          const files = yield* Effect.tryPromise(() => fs.readdir(dir)).pipe(Effect.catch(() => Effect.succeed([] as string[])))

          const mdFiles = files.filter((f) => f.endsWith(".md"))
          const entries: MemoryEntry[] = []

          for (const file of mdFiles) {
            const id = file.replace(/\.md$/, "")
            const filePath = path.join(dir, file)
            const content = yield* fsService.readFileString(filePath).pipe(Effect.catch(() => Effect.succeed("")))
            if (content) {
              // Try to extract a title from the first line if it's a heading
              const firstLine = content.split("\n")[0] ?? ""
              const title = firstLine.startsWith("#") ? firstLine.replace(/^#+\s*/, "").trim() : id

              entries.push({
                id,
                title,
                content,
              })
            }
          }

          return entries
        }).pipe(Effect.catch(() => Effect.succeed([] as MemoryEntry[]))),

      get: (id: string) =>
        Effect.gen(function* () {
          yield* ensureDir()
          const filePath = path.join(getMemoryDir(), `${id}.md`)
          const content = yield* fsService.readFileString(filePath).pipe(Effect.catch(() => Effect.succeed(null)))
          if (!content) return null
          const firstLine = content.split("\n")[0] ?? ""
          const title = firstLine.startsWith("#") ? firstLine.replace(/^#+\s*/, "").trim() : id
          return { id, title, content }
        }).pipe(Effect.catch(() => Effect.succeed(null))),

      add: (id: string, title: string, content: string) =>
        Effect.gen(function* () {
          yield* ensureDir()
          const filePath = path.join(getMemoryDir(), `${id}.md`)

          let finalContent = content
          if (!content.startsWith("# ")) {
            finalContent = `# ${title}\n\n${content}`
          }

          yield* fsService.writeFileString(filePath, finalContent)
        }).pipe(Effect.catch(() => Effect.void)),

      delete: (id: string) =>
        Effect.gen(function* () {
          const filePath = path.join(getMemoryDir(), `${id}.md`)
          yield* Effect.tryPromise(() => fs.unlink(filePath))
        }).pipe(Effect.catch(() => Effect.void)),
    })
  }),
).pipe(Layer.provide(AppFileSystem.defaultLayer))
