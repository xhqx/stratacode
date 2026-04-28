import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { hasIndexingPlugin, isIndexingPlugin, normalizePluginName } from "../../../src/detect"

describe("indexing plugin detection", () => {
  test("bundles detect module for browser targets", async () => {
    const dir = await mkdtemp(`${tmpdir()}/strata-indexing-detect-`)
    const result = await Bun.build({
      entrypoints: [new URL("../../../src/detect.ts", import.meta.url).pathname],
      minify: true,
      outdir: dir,
      target: "browser",
    })

    expect(result.success).toBe(true)
  })

  test("normalizes supported plugin forms", () => {
    expect(normalizePluginName("strata-indexing")).toBe("strata-indexing")
    expect(normalizePluginName("strata-indexing@1.2.3")).toBe("strata-indexing")
    expect(normalizePluginName("@stratacode/strata-indexing")).toBe("@stratacode/strata-indexing")
    expect(normalizePluginName("@stratacode/strata-indexing@1.2.3")).toBe("@stratacode/strata-indexing")
    expect(normalizePluginName("../../packages/strata-indexing")).toBe("@stratacode/strata-indexing")
    expect(normalizePluginName("file:///tmp/.opencode/plugin/strata-indexing.js")).toBe("strata-indexing")
    expect(normalizePluginName("file:///tmp/node_modules/@stratacode/strata-indexing/index.js")).toBe(
      "@stratacode/strata-indexing",
    )
    expect(normalizePluginName("file:///tmp/repo/packages/strata-indexing/src/index.ts")).toBe("@stratacode/strata-indexing")
  })

  test("detects supported indexing plugin specifiers", () => {
    const values = [
      "strata-indexing",
      "strata-indexing@1.2.3",
      "@stratacode/strata-indexing",
      "@stratacode/strata-indexing@1.2.3",
      "../../packages/strata-indexing",
      "file:///tmp/.opencode/plugin/strata-indexing.js",
      "file:///tmp/node_modules/@stratacode/strata-indexing/index.js",
      "file:///tmp/repo/packages/strata-indexing/src/index.ts",
    ]

    for (const value of values) {
      expect(isIndexingPlugin(value)).toBe(true)
    }
  })

  test("ignores unrelated plugin specifiers", () => {
    expect(isIndexingPlugin("@stratacode/strata-gateway")).toBe(false)
    expect(isIndexingPlugin("file:///tmp/.opencode/plugin/index.js")).toBe(false)
    expect(hasIndexingPlugin(["@stratacode/strata-gateway", "foo@1.0.0"])).toBe(false)
  })

  test("detects indexing plugin in merged plugin lists", () => {
    expect(
      hasIndexingPlugin(["@stratacode/strata-gateway", "file:///tmp/node_modules/@stratacode/strata-indexing/index.js"]),
    ).toBe(true)
  })
})
