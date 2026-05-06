// stratacode_change - new file
import { Effect, Layer } from "effect"
import { Log } from "@/util"
import { generateText } from "ai"
import { Provider, ProviderTransform } from "@/provider"
import { DocManifestService, type DocPageMeta } from "./doc-manifest"
import * as Config from "@/config/config"
import { CacheService } from "@/stratacode/repomap/cache"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { Ripgrep } from "@/file/ripgrep"
import { Bus } from "@/bus"
import { Started, Completed, Failed } from "./events"
import path from "path"
import fs from "fs"
import { createHash } from "crypto"

const layer = Layer.merge(Ripgrep.defaultLayer, AppFileSystem.defaultLayer)
const log = Log.create({ service: "worker:doc-worker" })

export interface DocWorkerPayload {
  files?: string[]
  force?: boolean
  structuralOnly?: boolean
}

function getPageId(filepath: string): string {
  return filepath.replace(/[^a-zA-Z0-9_-]/g, "-")
}

export async function docWorker(cwd: string, payload: DocWorkerPayload = {}): Promise<void> {
  const manifest = await DocManifestService.read(cwd)
  const store = await Effect.runPromise(CacheService.sync(cwd).pipe(Effect.provide(layer)))

  const targetFiles: string[] = []

  for (const [filepath, entry] of store.entries()) {
    // Only process requested files, or all if none requested
    if (payload.files && payload.files.length > 0 && !payload.files.includes(filepath)) {
      continue
    }

    const defs = entry.tags.filter((t) => t.kind === "def")
    if (defs.length === 0) continue // Skip files with no definitions

    targetFiles.push(filepath)
  }

  log.info("doc-worker started", { targetFiles: targetFiles.length })

  for (const filepath of targetFiles) {
    const pageId = getPageId(filepath)
    const entry = store.get(filepath)!
    const defs = entry.tags.filter((t) => t.kind === "def")

    const absPath = path.join(cwd, filepath)
    let content = ""
    try {
      content = await fs.promises.readFile(absPath, "utf-8")
    } catch {
      continue
    }

    const hash = createHash("sha256").update(content).digest("hex")
    const existing = manifest.pages.find((p) => p.id === pageId)

    if (!payload.force && existing && existing.hash === hash && existing.status === "ready") {
      continue // Up to date
    }

    const taskId = Math.random().toString(36).slice(2)
    Bus.publish(Started, { id: taskId, worker: "doc_worker", file: filepath }).catch(() => {})
    const startTime = Date.now()

    // Update manifest to "generating"
    const pageMeta: DocPageMeta = {
      id: pageId,
      path: filepath,
      title: path.basename(filepath),
      status: "generating",
      symbols: defs.length,
      generated: new Date().toISOString(),
      hash,
    }
    await DocManifestService.merge(cwd, { pages: [pageMeta] })

    try {
      let markdown = ""

      if (payload.structuralOnly) {
        markdown = `# ${filepath}\n\n## Structural Summary\n\nThis file contains the following symbols:\n\n`
        for (const def of defs) {
          markdown += `- \`${def.type}\` **${def.name}** (Line ${def.line})\n`
          if (def.signature) {
            markdown += `  \`\`\`ts\n  ${def.signature}\n  \`\`\`\n`
          }
        }
      } else {
        // Run full LLM generation
        const cfg = await Config.get()
        const defaultModel = await Provider.defaultModel()
        const model =
          (await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)) ??
          (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

        const language = await Provider.getLanguage(model)

        const systemPrompt = `You are an expert technical writer. Generate markdown documentation for the provided source code file.
Format your output as a clean Markdown document. Do not output anything outside of the Markdown document.
Include:
1. An Overview describing what the file does.
2. An Exports/Public API section detailing exported functions/classes.
3. Keep it concise but accurate.`

        const result = await generateText({
          model: language,
          temperature: 0.1,
          providerOptions: ProviderTransform.providerOptions(model, model.options ?? {}),
          maxRetries: 2,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `File: ${filepath}\n\nSource Code:\n\`\`\`\n${content}\n\`\`\`\n\nExtracted Symbols:\n${defs.map((d) => `- ${d.type} ${d.name}`).join("\n")}`,
            },
          ],
        })

        markdown = result.text.trim()
      }

      // Write markdown file
      const docPath = path.join(cwd, ".stratacode", "docs", `${pageId}.md`)
      await fs.promises.mkdir(path.dirname(docPath), { recursive: true }).catch(() => null)
      await fs.promises.writeFile(docPath, markdown, "utf-8")

      pageMeta.status = "ready"
      pageMeta.generated = new Date().toISOString()
      await DocManifestService.merge(cwd, { pages: [pageMeta] })

      Bus.publish(Completed, {
        id: taskId,
        worker: "doc_worker",
        duration: Date.now() - startTime,
        result: `Generated doc for ${filepath}`,
      }).catch(() => {})
    } catch (err) {
      log.error(`doc_worker failed for ${filepath}`, { err })
      pageMeta.status = "error"
      pageMeta.error = err instanceof Error ? err.message : String(err)
      await DocManifestService.merge(cwd, { pages: [pageMeta] })

      Bus.publish(Failed, { id: taskId, worker: "doc_worker", error: pageMeta.error }).catch(() => {})
    }
  }
}
