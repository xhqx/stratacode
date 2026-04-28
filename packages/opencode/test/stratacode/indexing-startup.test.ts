import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { CodeIndexManager } from "@stratacode/strata-indexing/engine"
import { Hono } from "hono"
import type { Config } from "../../src/config"
import { StrataIndexing } from "../../src/stratacode/indexing"
import { Instance } from "../../src/project/instance"
import { IndexingRoutes } from "../../src/stratacode/server/routes/indexing"
import { Log } from "../../src/util"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const cfg: Partial<Config.Info> = {
  plugin: ["@stratacode/strata-indexing"],
  experimental: {
    semantic_indexing: true,
  },
  indexing: {
    enabled: true,
    provider: "ollama",
    vectorStore: "qdrant",
    ollama: {
      baseUrl: "http://127.0.0.1:1",
    },
  },
}

const off: Partial<Config.Info> = {
  plugin: ["@stratacode/strata-indexing"],
  experimental: {
    semantic_indexing: false,
  },
  indexing: {
    enabled: true,
    provider: "ollama",
    vectorStore: "qdrant",
    ollama: {
      baseUrl: "http://127.0.0.1:1",
    },
  },
}
const configDir = process.env["STRATA_CONFIG_DIR"]
const error = new Error("test indexing initialization failed")

afterEach(async () => {
  if (configDir === undefined) delete process.env["STRATA_CONFIG_DIR"]
  else process.env["STRATA_CONFIG_DIR"] = configDir
  await Instance.disposeAll()
})

describe("indexing startup degradation", () => {
  test("keeps server routes alive when indexing initialization fails", async () => {
    const init = spyOn(CodeIndexManager.prototype, "initialize").mockRejectedValue(error)

    await using tmp = await tmpdir({ git: true, config: cfg })
    process.env["STRATA_CONFIG_DIR"] = tmp.path

    try {
      const app = new Hono().route("/indexing", IndexingRoutes())

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const status = await app.request("/indexing/status")
          expect(status.status).toBe(200)

          const body = await status.json()
          expect(body).toMatchObject({
            state: "Error",
          })
          expect(body.message).toContain("Failed to initialize: test indexing initialization failed")
        },
      })
    } finally {
      init.mockRestore()
    }
  })

  test("keeps degraded indexing queryable but unavailable", async () => {
    const init = spyOn(CodeIndexManager.prototype, "initialize").mockRejectedValue(error)

    await using tmp = await tmpdir({ git: true, config: cfg })
    process.env["STRATA_CONFIG_DIR"] = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const status = await StrataIndexing.current()

          expect(status.state).toBe("Error")
          expect(status.message).toContain("Failed to initialize: test indexing initialization failed")
          expect(await StrataIndexing.available()).toBe(false)
          expect(StrataIndexing.ready()).toBe(false)
          expect(await StrataIndexing.search("boot failure")).toEqual([])
        },
      })
    } finally {
      init.mockRestore()
    }
  })

  test("reports not ready while initialization is in flight", async () => {
    await using tmp = await tmpdir({ git: true, config: cfg })
    process.env["STRATA_CONFIG_DIR"] = tmp.path
    const gate = Promise.withResolvers<{ requiresRestart: boolean }>()
    const init = spyOn(CodeIndexManager.prototype, "initialize").mockImplementation(() => gate.promise)

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const boot = StrataIndexing.init()
          await new Promise<void>((resolve, reject) => {
            const start = performance.now()
            const poll = () => {
              if (init.mock.calls.length > 0) return resolve()
              if (performance.now() - start > 5000) return reject(new Error("indexing initialization did not start"))
              setTimeout(poll, 10)
            }
            poll()
          })

          expect(init).toHaveBeenCalled()
          expect(StrataIndexing.ready()).toBe(false)
          gate.resolve({ requiresRestart: false })
          await boot
        },
      })
    } finally {
      gate.resolve({ requiresRestart: false })
      init.mockRestore()
    }
  })

  test("stays disabled when semantic indexing flag is off", async () => {
    await using tmp = await tmpdir({ git: true, config: off })
    process.env["STRATA_CONFIG_DIR"] = tmp.path
    const init = spyOn(CodeIndexManager.prototype, "initialize")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const status = await StrataIndexing.current()

        expect(status).toMatchObject({
          state: "Disabled",
          message: "Semantic indexing is disabled. Enable it in the Experimental settings.",
        })
        expect(await StrataIndexing.available()).toBe(false)
        expect(StrataIndexing.ready()).toBe(false)
        expect(await StrataIndexing.search("flag off")).toEqual([])
        expect(init).not.toHaveBeenCalled()
      },
    })
  })
})
