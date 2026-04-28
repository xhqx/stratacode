#!/usr/bin/env bun
/**
 * Transform package names and branding from opencode to strata
 *
 * This script transforms:
 * - opencode-ai -> @stratacode/cli
 * - @opencode-ai/cli -> @stratacode/cli
 * - @opencode-ai/sdk -> @stratacode/sdk
 * - @opencode-ai/plugin -> @stratacode/plugin
 * - OPENCODE_* -> STRATA_* (env variables, excluding OPENCODE_API_KEY)
 * - x-opencode-* -> x-strata-* (HTTP headers)
 * - opencode.db -> strata.db (database filename)
 * - window.__OPENCODE__ -> window.__STRATA__ (window global)
 */

import { Glob } from "bun"
import { info, success, warn, debug } from "../utils/logger"
import { defaultConfig } from "../utils/config"

export interface TransformResult {
  file: string
  changes: number
  dryRun: boolean
}

export interface TransformOptions {
  dryRun?: boolean
  verbose?: boolean
}

const PACKAGE_PATTERNS = [
  // In package.json name field
  { pattern: /"name":\s*"opencode-ai"/, replacement: '"name": "@stratacode/cli"' },
  { pattern: /"name":\s*"@opencode-ai\/cli"/, replacement: '"name": "@stratacode/cli"' },

  // In dependencies/devDependencies
  { pattern: /"opencode-ai":\s*"/g, replacement: '"@stratacode/cli": "' },
  { pattern: /"@opencode-ai\/cli":\s*"/g, replacement: '"@stratacode/cli": "' },
  { pattern: /"@opencode-ai\/sdk":\s*"/g, replacement: '"@stratacode/sdk": "' },
  { pattern: /"@opencode-ai\/plugin":\s*"/g, replacement: '"@stratacode/plugin": "' },

  // In any string context (mock.module, dynamic references, etc.)
  // Only cli, sdk, and plugin are renamed — other @opencode-ai/* packages
  // (e.g. @opencode-ai/ui, @opencode-ai/util) keep their upstream names.
  { pattern: /@opencode-ai\/cli(?=\/|"|'|`|$)/g, replacement: "@stratacode/cli" },
  { pattern: /@opencode-ai\/sdk(?=\/|"|'|`|$)/g, replacement: "@stratacode/sdk" },
  { pattern: /@opencode-ai\/plugin(?=\/|"|'|`|$)/g, replacement: "@stratacode/plugin" },

  // In import statements (supports subpaths like @opencode-ai/sdk/v2)
  { pattern: /from\s+["']opencode-ai["']/g, replacement: 'from "@stratacode/cli"' },
  { pattern: /from\s+["']@opencode-ai\/cli(\/[^"']*)?["']/g, replacement: 'from "@stratacode/cli$1"' },
  { pattern: /from\s+["']@opencode-ai\/sdk(\/[^"']*)?["']/g, replacement: 'from "@stratacode/sdk$1"' },
  { pattern: /from\s+["']@opencode-ai\/plugin(\/[^"']*)?["']/g, replacement: 'from "@stratacode/plugin$1"' },

  // In require statements (supports subpaths like @opencode-ai/sdk/v2)
  { pattern: /require\(["']opencode-ai["']\)/g, replacement: 'require("@stratacode/cli")' },
  { pattern: /require\(["']@opencode-ai\/cli(\/[^"']*)?["']\)/g, replacement: 'require("@stratacode/cli$1")' },
  { pattern: /require\(["']@opencode-ai\/sdk(\/[^"']*)?["']\)/g, replacement: 'require("@stratacode/sdk$1")' },
  { pattern: /require\(["']@opencode-ai\/plugin(\/[^"']*)?["']\)/g, replacement: 'require("@stratacode/plugin$1")' },

  // Internal placeholder hostname used for in-process RPC (never resolved by DNS)
  { pattern: /opencode\.internal/g, replacement: "strata.internal" },

  // In npx/npm commands
  { pattern: /npx opencode-ai/g, replacement: "npx @stratacode/cli" },
  { pattern: /npm install opencode-ai/g, replacement: "npm install @stratacode/cli" },
  { pattern: /bun add opencode-ai/g, replacement: "bun add @stratacode/cli" },

  // SDK public API renames (Opencode → Strata)
  // Order matters: longer names first to avoid partial matches
  { pattern: /OpencodeClientConfig/g, replacement: "StrataClientConfig" },
  { pattern: /createOpencodeClient/g, replacement: "createStrataClient" },
  { pattern: /createOpencodeServer/g, replacement: "createStrataServer" },
  { pattern: /createOpencodeTui/g, replacement: "createStrataTui" },
  { pattern: /OpencodeClient/g, replacement: "StrataClient" },
  // createOpencode (without suffix) needs negative lookahead to avoid matching createOpencodeClient
  { pattern: /\bcreateOpencode\b(?!Client|Server|Tui)/g, replacement: "createStrata" },

  // Branding: environment variables (exclude OPENCODE_API_KEY — upstream Zen SaaS key)
  { pattern: /\bOPENCODE_(?!API_KEY\b)([A-Z_]+)\b/g, replacement: "STRATA_$1" },
  { pattern: /VITE_OPENCODE_/g, replacement: "VITE_STRATA_" },
  { pattern: /_EXTENSION_OPENCODE_/g, replacement: "_EXTENSION_STRATA_" },

  // Branding: HTTP header prefix
  { pattern: /x-opencode-/g, replacement: "x-strata-" },

  // Branding: window global
  { pattern: /window\.__OPENCODE__/g, replacement: "window.__STRATA__" },

  // Branding: database filename
  { pattern: /opencode\.db/g, replacement: "strata.db" },
]

/**
 * Transform package names in a single file
 */
export async function transformFile(filePath: string, options: TransformOptions = {}): Promise<TransformResult> {
  const file = Bun.file(filePath)
  let content = await file.text()
  const original = content
  let changes = 0

  for (const { pattern, replacement } of PACKAGE_PATTERNS) {
    const regex = typeof pattern === "string" ? new RegExp(pattern, "g") : pattern
    const newContent = content.replace(regex, replacement)
    if (newContent !== content) {
      const count = (content.match(regex) || []).length
      changes += count
      content = newContent
    }
  }

  if (changes > 0 && !options.dryRun) {
    await Bun.write(filePath, content)
  }

  return {
    file: filePath,
    changes,
    dryRun: options.dryRun ?? false,
  }
}

/**
 * Transform package names in all relevant files
 */
export async function transformAll(options: TransformOptions = {}): Promise<TransformResult[]> {
  const results: TransformResult[] = []

  // Find all relevant files
  const patterns = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.json", "**/*.md"]

  const excludes = defaultConfig.excludePatterns

  for (const pattern of patterns) {
    const glob = new Glob(pattern)

    for await (const path of glob.scan({ absolute: true })) {
      // Skip excluded paths
      if (excludes.some((ex) => path.includes(ex.replace(/\*\*/g, "")))) {
        continue
      }

      const result = await transformFile(path, options)

      if (result.changes > 0) {
        results.push(result)

        if (options.dryRun) {
          info(`[DRY-RUN] Would transform ${result.file}: ${result.changes} changes`)
        } else {
          success(`Transformed ${result.file}: ${result.changes} changes`)
        }
      }
    }
  }

  return results
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const verbose = args.includes("--verbose")

  if (dryRun) {
    info("Running in dry-run mode (no files will be modified)")
  }

  const results = await transformAll({ dryRun, verbose })

  console.log()
  success(`Transformed ${results.length} files`)

  if (dryRun) {
    info("Run without --dry-run to apply changes")
  }
}
