// stratacode_change - new file
import { Effect } from "effect"
import { Log } from "@/util"
import { EXTENSIONS, QUERIES } from "./queries"
import { lazy } from "@/util/lazy"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs/promises"
import type { Parser, Language, Query } from "web-tree-sitter"

const log = Log.create({ service: "repomap:parser" })

export interface Tag {
  name: string
  kind: "def" | "ref"
  type: string
  line: number
  signature?: string
}

// Ensure WASM file URLs are correctly resolved to file paths
function resolveWasm(asset: string | URL): string {
  if (asset instanceof URL) return fileURLToPath(asset)
  if (typeof asset === "string") {
    if (asset.startsWith("file://")) return fileURLToPath(asset)
    if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
    const url = new URL(asset, import.meta.url)
    return fileURLToPath(url)
  }
  throw new Error("Invalid WASM asset type")
}

// Tree-sitter must be initialized once globally
const initTreeSitter = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  // The default export of the wasm file is a string (or URL) pointing to the path
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  return Parser
})

class Engine {
  private parser: Parser | null = null
  private languages = new Map<string, Language>()
  private queries = new Map<string, Query | null>() // null means validation failed

  constructor(private ParserClass: typeof Parser) {
    this.parser = new this.ParserClass()
  }

  /**
   * Lazily loads a language WASM and compiles its query.
   * If either fails, logs the error and marks the query as failed (null).
   */
  private async getLanguageAndQuery(
    langKey: string,
    queryKey: string,
  ): Promise<{ language: Language; query: Query | null } | null> {
    if (!this.languages.has(langKey)) {
      try {
        // Construct the module path for tree-sitter-wasms
        // e.g. "tree-sitter-typescript/tree-sitter-typescript.wasm"
        const modName = `tree-sitter-wasms/out/tree-sitter-${langKey}.wasm`
        const { default: wasmAsset } = await import(modName as string, {
          with: { type: "wasm" },
        })

        const wasmPath = resolveWasm(wasmAsset)
        const { Language, Query } = await import("web-tree-sitter")
        const language = await Language.load(wasmPath)
        this.languages.set(langKey, language)

        // Compile query
        const queryString = QUERIES[queryKey]
        if (!queryString) {
          log.warn("no query defined", { language: langKey, query: queryKey })
          this.queries.set(queryKey, null)
        } else {
          try {
            const query = new Query(language, queryString)
            this.queries.set(queryKey, query)
          } catch (err) {
            log.warn("query compilation failed", { language: langKey, query: queryKey, error: String(err) })
            this.queries.set(queryKey, null)
          }
        }
      } catch (err) {
        log.error("failed to load language wasm", { language: langKey, error: String(err) })
        return null
      }
    }

    const language = this.languages.get(langKey)!
    const query = this.queries.get(queryKey) ?? null
    return { language, query }
  }

  async extract(filepath: string, content: string): Promise<Tag[]> {
    const ext = path.extname(filepath).toLowerCase()
    const mapping = EXTENSIONS[ext]
    if (!mapping) return [] // Unsupported extension

    const lq = await this.getLanguageAndQuery(mapping.parser, mapping.query)
    if (!lq || !lq.query || !this.parser) return []

    try {
      this.parser.setLanguage(lq.language)
      const tree = this.parser.parse(content)
      if (!tree) return []
      const captures = lq.query.captures(tree.rootNode)

      const tags: Tag[] = []
      for (const capture of captures) {
        const { name, node } = capture

        // Example name: "name.definition.function" or "name.reference.import"
        if (name.startsWith("name.definition.")) {
          const type = name.split(".").pop() || "unknown"
          // For the signature, we grab the text of the line the node starts on
          // Extract the full line text up to the node's position to show context
          const lines = content.split("\n")
          const lineText = lines[node.startPosition.row]?.trim()

          tags.push({
            name: node.text,
            kind: "def",
            type,
            line: node.startPosition.row + 1, // 1-indexed
            signature: lineText,
          })
          continue
        }

        if (name.startsWith("name.reference.")) {
          // imports, requires, etc. (for ranking)
          // Strip quotes from import strings
          const refName = node.text.replace(/^['"]|['"]$/g, "")
          tags.push({
            name: refName,
            kind: "ref",
            type: "import",
            line: node.startPosition.row + 1,
          })
        }
      }

      return tags
    } catch (err) {
      log.warn("parse failed", { filepath, error: String(err) })
      return [] // Graceful degradation on syntax error or timeout
    }
  }
}

// Singleton engine instance initialized lazily
const engineInit = lazy(async () => {
  try {
    const ParserClass = await initTreeSitter()
    return new Engine(ParserClass)
  } catch (err) {
    log.error("failed to initialize tree-sitter engine", { error: String(err) })
    throw err
  }
})

export namespace ParserService {
  /**
   * Parses the given file content and extracts structural tags.
   * If the file extension is not supported, or the parser/query fails, returns an empty array.
   */
  export const extract = (filepath: string, content: string) =>
    Effect.tryPromise({
      try: async () => {
        const engine = await engineInit()
        return await engine.extract(filepath, content)
      },
      catch: (cause) => new Error("Parser extraction failed", { cause }),
    })

  // Expose engineInit for tests
  export const _init = engineInit
}
