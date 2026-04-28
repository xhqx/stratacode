// stratacode_change - new file
import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import os from "os"
import path from "path"

const root = path.join(import.meta.dir, "..", "..")
const wrapper = path.join(root, "bin", "strata")

describe("npm install artifact behavior", () => {
  test("keeps the CLI wrapper contract", async () => {
    const text = await fs.readFile(wrapper, "utf8")
    expect(text.startsWith("#!/usr/bin/env node")).toBe(true)
    expect(text).toContain("const envPath = process.env.STRATA_BIN_PATH")
    expect(text).toContain('const base = "@stratacode/cli-" + platform + "-" + arch')
    expect(text).toContain("function findBinary(startDir)")
  })

  test("links npm bin commands to the wrapper during local install", async () => {
    const npmPath = Bun.which("npm")
    if (!npmPath) {
      console.warn("Skipping install artifact test: npm is not available in PATH")
      return
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "strata-install-artifact-"))
    try {
      const pkg = path.join(tmp, "pkg")
      const bin = path.join(pkg, "bin")
      const prefix = path.join(tmp, "prefix")
      await fs.mkdir(bin, { recursive: true })
      await fs.mkdir(prefix, { recursive: true })
      await fs.copyFile(wrapper, path.join(bin, "strata"))
      await Bun.write(
        path.join(pkg, "package.json"),
        JSON.stringify(
          {
            name: "strata-install-artifact-repro",
            version: "1.0.0",
            bin: {
              strata: "./bin/strata",
              stratacode: "./bin/strata",
            },
          },
          null,
          2,
        ),
      )

      await $`npm install --prefix ${prefix} ${pkg} --no-package-lock --ignore-scripts --no-audit --no-fund`.quiet()

      const commands = ["strata", "stratacode"]
      for (const name of commands) {
        const link = path.join(prefix, "node_modules", ".bin", name)
        const stat = await fs.lstat(link)
        expect(stat.isSymbolicLink() || stat.isFile()).toBe(true)
      }

      const hidden = path.join(prefix, "node_modules", ".bin", ".strata")
      const exists = await fs
        .access(hidden)
        .then(() => true)
        .catch(() => false)
      if (!exists) return

      const stat = await fs.lstat(hidden)
      expect(stat.isFile() || stat.isSymbolicLink()).toBe(true)
      if (!stat.isSymbolicLink()) expect(stat.size).toBeGreaterThan(0)
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  }, 60_000) // stratacode_change
})
