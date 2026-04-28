import { describe, expect, spyOn, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Effect, Layer } from "effect"
import { LSP } from "../../src/lsp"
import { LSPServer } from "../../src/lsp"
import * as launch from "../../src/lsp/launch" // stratacode_change - spy on spawn
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { provideTmpdirInstance, tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Instance, type InstanceContext } from "../../src/project/instance"
import { Flag } from "../../src/flag/flag" // stratacode_change
import { TsCheck } from "../../src/stratacode/ts-check" // stratacode_change

// stratacode_change - Typescript.spawn ignores ctx, so a cast is fine here.
const fakeCtx = {} as InstanceContext

const it = testEffect(Layer.mergeAll(LSP.defaultLayer, CrossSpawnSpawner.defaultLayer))

describe("lsp.spawn", () => {
  it.live("does not spawn builtin LSP for files outside instance", () =>
    provideTmpdirInstance(
      (dir) =>
        LSP.Service.use((lsp) =>
          Effect.gen(function* () {
            const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)

            try {
              yield* lsp.touchFile(path.join(dir, "..", "outside.ts"))
              yield* lsp.hover({
                file: path.join(dir, "..", "hover.ts"),
                line: 0,
                character: 0,
              })
              expect(spy).toHaveBeenCalledTimes(0)
            } finally {
              spy.mockRestore()
            }
          }),
        ),
      { config: { lsp: true } },
    ),
  )

  it.live("does not spawn builtin LSP for files inside instance when LSP is unset", () =>
    provideTmpdirInstance((dir) =>
      LSP.Service.use((lsp) =>
        Effect.gen(function* () {
          const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)

          try {
            yield* lsp.hover({
              file: path.join(dir, "src", "inside.ts"),
              line: 0,
              character: 0,
            })
            expect(spy).toHaveBeenCalledTimes(0)
          } finally {
            spy.mockRestore()
          }
        }),
      ),
    ),
  )

  // stratacode_change start - enable flag so spawn() is reached past the TsClient short-circuit
  it.live("would spawn builtin LSP for files inside instance when lsp is true", () =>
    provideTmpdirInstance(
      (dir) =>
        LSP.Service.use((lsp) =>
          Effect.gen(function* () {
            const saved = Flag.STRATA_EXPERIMENTAL_LSP_TOOL
            Flag.STRATA_EXPERIMENTAL_LSP_TOOL = true
            const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)

            try {
              yield* lsp.hover({
                file: path.join(dir, "src", "inside.ts"),
                line: 0,
                character: 0,
              })
              expect(spy).toHaveBeenCalledTimes(1)
            } finally {
              Flag.STRATA_EXPERIMENTAL_LSP_TOOL = saved
              spy.mockRestore()
            }
          }),
        ),
      { config: { lsp: true } },
    ),
  )

  it.live("would spawn builtin LSP for files inside instance when config object is provided", () =>
    provideTmpdirInstance(
      (dir) =>
        LSP.Service.use((lsp) =>
          Effect.gen(function* () {
            const saved = Flag.STRATA_EXPERIMENTAL_LSP_TOOL
            Flag.STRATA_EXPERIMENTAL_LSP_TOOL = true
            const spy = spyOn(LSPServer.Typescript, "spawn").mockResolvedValue(undefined)

            try {
              yield* lsp.hover({
                file: path.join(dir, "src", "inside.ts"),
                line: 0,
                character: 0,
              })
              expect(spy).toHaveBeenCalledTimes(1)
            } finally {
              Flag.STRATA_EXPERIMENTAL_LSP_TOOL = saved
              spy.mockRestore()
            }
          }),
        ),
      {
        config: {
          lsp: {
            eslint: { disabled: true },
          },
        },
      },
    ),
  )
  // stratacode_change end

  // stratacode_change start - Typescript spawn is gated behind STRATA_EXPERIMENTAL_LSP_TOOL.
  test("spawns tsgo LSP when STRATA_EXPERIMENTAL_LSP_TOOL is enabled", async () => {
    const saved = Flag.STRATA_EXPERIMENTAL_LSP_TOOL
    Flag.STRATA_EXPERIMENTAL_LSP_TOOL = true
    await using tmp = await tmpdir()

    const spawnSpy = spyOn(launch, "spawn").mockImplementation(
      () => ({ stdin: {}, stdout: {}, stderr: {}, on: () => {}, kill: () => {} }) as any,
    )
    const tsgoSpy = spyOn(TsCheck, "native_tsgo").mockResolvedValue("/fake/tsgo")

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await LSPServer.Typescript.spawn(tmp.path, fakeCtx)
          expect(result).toBeDefined()
          expect(tsgoSpy).toHaveBeenCalledWith(tmp.path)
          expect(spawnSpy).toHaveBeenCalled()
          const args = spawnSpy.mock.calls[0][1] as string[]
          expect(args).toContain("--lsp")
          expect(args).toContain("--stdio")
        },
      })
    } finally {
      Flag.STRATA_EXPERIMENTAL_LSP_TOOL = saved
      spawnSpy.mockRestore()
      tsgoSpy.mockRestore()
    }
  })

  test("Typescript.spawn returns undefined when STRATA_EXPERIMENTAL_LSP_TOOL is off", async () => {
    const saved = Flag.STRATA_EXPERIMENTAL_LSP_TOOL
    Flag.STRATA_EXPERIMENTAL_LSP_TOOL = false
    try {
      const result = await LSPServer.Typescript.spawn("/tmp/any", fakeCtx)
      expect(result).toBeUndefined()
    } finally {
      Flag.STRATA_EXPERIMENTAL_LSP_TOOL = saved
    }
  })
  // stratacode_change end
})
