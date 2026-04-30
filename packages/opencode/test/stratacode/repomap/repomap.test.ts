import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { RepoMap } from "@/stratacode/repomap"
import { CacheService } from "@/stratacode/repomap/cache"
import { ParserService } from "@/stratacode/repomap/parser"
import { Ripgrep } from "@/file/ripgrep"
import { Effect } from "effect"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"

describe("RepoMap Integration", () => {
  let tmpDir: string

  beforeAll(async () => {
    await ParserService._init()

    // Create a temporary workspace with some dummy files
    tmpDir = path.join(__dirname, "fixture")
    await fs.mkdir(tmpDir, { recursive: true })

    await fs.writeFile(
      path.join(tmpDir, "index.ts"),
      `
      export function bootstrap() {
        console.log("booting")
      }
      export class Application {
        start() {}
      }
    `,
    )

    await fs.writeFile(
      path.join(tmpDir, "utils.py"),
      `
      import os
      
      def helper_func():
          pass
          
      class UtilityClass:
          pass
    `,
    )

    // Should be ignored by deny list
    await fs.writeFile(path.join(tmpDir, ".env"), "SECRET=true")
    await fs.writeFile(path.join(tmpDir, "yarn.lock"), "lockfile content")
  })

  it("generates a budgeted map of the workspace", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.provide(RepoMap.generate({ cwd: tmpDir, budget: 1024 }), Ripgrep.defaultLayer),
        AppFileSystem.defaultLayer,
      ),
    )

    // Check wrapper
    expect(result.map).toStartWith("<repo_map>\\n")
    expect(result.map).toEndWith("</repo_map>")

    // Check content
    expect(result.map).toInclude("index.ts:")
    expect(result.map).toInclude("│ function bootstrap")
    expect(result.map).toInclude("│ class Application")
    expect(result.map).toInclude("│ function start")

    expect(result.map).toInclude("utils.py:")
    expect(result.map).toInclude("│ function helper_func")
    expect(result.map).toInclude("│ class UtilityClass")

    // Check exclusions
    expect(result.map).not.toInclude(".env:")
    expect(result.map).not.toInclude("yarn.lock:")

    // Check stats
    expect(result.stats.files).toBe(2)
    expect(result.stats.symbols).toBe(5)
    expect(result.stats.budget).toBe(1024)
  })

  it("supports invalidation", async () => {
    // Modify a file
    await fs.writeFile(
      path.join(tmpDir, "index.ts"),
      `
      export function changedFunc() {}
    `,
    )

    // Invalidate just that file
    await Effect.runPromise(RepoMap.invalidate(["index.ts"]))

    // Regenerate
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.provide(RepoMap.generate({ cwd: tmpDir, budget: 1024 }), Ripgrep.defaultLayer),
        AppFileSystem.defaultLayer,
      ),
    )

    expect(result.map).toInclude("│ function changedFunc")
    expect(result.map).not.toInclude("│ function bootstrap")
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})
