import { describe, it, expect, mock, beforeEach } from "bun:test"
import { injectProjectContext } from "@/stratacode/project-context"
import { ContextMapService } from "@/stratacode/worker/context-map"
import { RepoMap } from "@/stratacode/repomap"
import { Effect } from "effect"
import { Config } from "@/config"

// Mock the dependencies
mock.module("@/config", () => ({
  Config: {
    get: mock(() => Promise.resolve({ workers: { enabled: true } })),
  },
}))

mock.module("@/stratacode/worker/context-map", () => ({
  ContextMapService: {
    read: mock(() => Promise.resolve({ summary: "Test Summary" })),
  },
}))

mock.module("@/stratacode/repomap", () => ({
  RepoMap: {
    generate: mock(() => Effect.succeed({ map: "<repo_map>\nTest Map", stats: {} })),
  },
}))

describe("project-context", () => {
  beforeEach(() => {
    mock.module("@/config", () => ({
      Config: {
        get: mock(() => Promise.resolve({ workers: { enabled: true } })),
      },
    }))
  })

  it("should return prompt unchanged if workers are disabled", async () => {
    mock.module("@/config", () => ({
      Config: {
        get: mock(() => Promise.resolve({ workers: { enabled: false } })),
      },
    }))
    
    const prompt = "Original prompt"
    const result = await injectProjectContext(prompt, { cwd: "/test" })
    expect(result).toBe(prompt)
  })

  it("should return prompt unchanged if summary and repomap are false", async () => {
    const prompt = "Original prompt"
    const result = await injectProjectContext(prompt, { 
      cwd: "/test", 
      summary: false, 
      repomap: false 
    })
    expect(result).toBe(prompt)
  })

  it("should inject both summary and repomap by default", async () => {
    const prompt = "Original prompt"
    const result = await injectProjectContext(prompt, { cwd: "/test" })
    
    expect(result).toContain("## Project Context")
    expect(result).toContain("Test Summary")
    expect(result).toContain("<repo_map>\nTest Map")
    expect(result).toContain("Original prompt")
  })

  it("should inject only summary when repomap is false", async () => {
    const prompt = "Original prompt"
    const result = await injectProjectContext(prompt, { 
      cwd: "/test", 
      summary: true, 
      repomap: false 
    })
    
    expect(result).toContain("## Project Context")
    expect(result).toContain("Test Summary")
    expect(result).not.toContain("<repo_map>")
    expect(result).toContain("Original prompt")
  })

  it("should swallow errors and return prompt unchanged if everything fails", async () => {
    mock.module("@/stratacode/worker/context-map", () => ({
      ContextMapService: {
        read: mock(() => Promise.reject(new Error("summary failed"))),
      },
    }))
    
    mock.module("@/stratacode/repomap", () => ({
      RepoMap: {
        generate: mock(() => Effect.fail(new Error("repomap failed"))),
      },
    }))

    const prompt = "Original prompt"
    const result = await injectProjectContext(prompt, { cwd: "/test" })
    expect(result).toBe(prompt)
  })
})
