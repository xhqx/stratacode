import { describe, expect, test, mock } from "bun:test"
import * as vscode from "vscode"

// Mock vscode before importing the registry
mock.module("vscode", () => ({
  EventEmitter: class {
    private listeners: any[] = []
    event = (listener: any) => {
      this.listeners.push(listener)
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener) } }
    }
    fire(data: any) {
      this.listeners.forEach(l => l(data))
    }
  },
  Disposable: class {
    constructor(private callOnDispose: () => void) {}
    dispose() {
      this.callOnDispose()
    }
  },
  commands: {
    executeCommand: mock(() => Promise.resolve())
  },
  workspace: {
    onDidChangeConfiguration: mock(() => ({ dispose: () => {} })),
    getConfiguration: mock((section: string) => ({
      get: mock((key: string) => {
        if (section === "test-section" && key === "test-key") return "test-val"
        return undefined
      }),
      update: mock(() => Promise.resolve())
    }))
  }
}))

import { PluginRegistry } from "../../../src/plugin-api/index"
import type { UIContribution } from "@stratacode/vscode-api"

describe("PluginRegistry", () => {
  test("registers and returns renderable contributions", () => {
    const registry = new PluginRegistry()
    const contrib: UIContribution = {
      id: "test.btn",
      placement: "input-toolbar",
      type: "button",
      label: "Test",
      command: "test.cmd"
    }

    registry.registerUIContribution(contrib)
    const renderables = registry.getRenderableContributions()
    
    expect(renderables.length).toBe(1)
    expect(renderables[0].id).toBe("test.btn")
    expect(renderables[0]).not.toHaveProperty("command") // Command should be stripped
  })

  test("removes contribution on dispose", () => {
    const registry = new PluginRegistry()
    const contrib: UIContribution = {
      id: "test.btn",
      placement: "input-toolbar",
      type: "button",
      command: "test.cmd"
    }

    const disposable = registry.registerUIContribution(contrib)
    expect(registry.getRenderableContributions().length).toBe(1)
    
    disposable.dispose()
    expect(registry.getRenderableContributions().length).toBe(0)
  })

  test("executes command securely", () => {
    const registry = new PluginRegistry()
    const contrib: UIContribution = {
      id: "test.btn",
      placement: "input-toolbar",
      type: "button",
      command: "test.cmd",
      commandArgs: ["arg1", 123]
    }

    registry.registerUIContribution(contrib)
    registry.executeContribution("test.btn")
    
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("test.cmd", "arg1", 123)
  })

  test("ignores unknown execution ids safely", () => {
    const registry = new PluginRegistry()
    // Should not throw, should just warn
    registry.executeContribution("unknown.btn")
  })

  // Phase 3 Tests

  describe("Config Sections", () => {
    test("registers and returns renderable config sections", () => {
      const registry = new PluginRegistry()
      registry.registerConfigSection({
        id: "test-section",
        title: "Test Section",
        fields: [{ key: "test-key", type: "string", label: "Test Key" }]
      })

      const sections = registry.getRenderableConfigSections()
      expect(sections.length).toBe(1)
      expect(sections[0].id).toBe("test-section")
      expect(sections[0].title).toBe("Test Section")
      expect(sections[0].fields[0].key).toBe("test-key")
    })

    test("removes config section on dispose", () => {
      const registry = new PluginRegistry()
      const disposable = registry.registerConfigSection({
        id: "test-section",
        title: "Test Section",
        fields: [{ key: "test-key", type: "string", label: "Test Key" }]
      })

      expect(registry.getRenderableConfigSections().length).toBe(1)
      disposable.dispose()
      expect(registry.getRenderableConfigSections().length).toBe(0)
    })

    test("reads values from workspace configuration", () => {
      const registry = new PluginRegistry()
      registry.registerConfigSection({
        id: "test-section",
        title: "Test",
        fields: [{ key: "test-key", type: "string", label: "Key" }]
      })

      expect(registry.getPluginConfigValue("test-section", "test-key")).toBe("test-val")
      expect(registry.getPluginConfigValue("test-section", "unknown")).toBe(undefined)
    })

    test("rejects invalid config sections", () => {
      const registry = new PluginRegistry()
      // Missing key
      const disposable = registry.registerConfigSection({
        id: "bad-section",
        title: "Bad",
        fields: [{ key: "", type: "string", label: "Bad" }]
      })

      expect(registry.getRenderableConfigSections().length).toBe(0)
    })
  })

  describe("Context Providers", () => {
    test("gathers context items", async () => {
      const registry = new PluginRegistry()
      registry.registerContextProvider({
        id: "test.provider",
        label: "Test Provider",
        provideContext: async () => [{ type: "text", label: "Test", content: "Hello" }]
      })

      const items = await registry.getContextItems({ id: "s1", title: "Test", directory: "/" })
      expect(items.length).toBe(1)
      expect(items[0].content).toBe("Hello")
    })

    test("handles throwing providers safely", async () => {
      const registry = new PluginRegistry()
      registry.registerContextProvider({
        id: "bad.provider",
        label: "Bad",
        provideContext: async () => { throw new Error("Boom") }
      })
      registry.registerContextProvider({
        id: "good.provider",
        label: "Good",
        provideContext: async () => [{ type: "text", label: "Good", content: "Valid" }]
      })

      const items = await registry.getContextItems({ id: "s1", title: "Test", directory: "/" })
      expect(items.length).toBe(1)
      expect(items[0].content).toBe("Valid")
    })

    test("enforces overall timeout", async () => {
      const registry = new PluginRegistry()
      registry.registerContextProvider({
        id: "slow.provider",
        label: "Slow",
        provideContext: () => new Promise(resolve => setTimeout(resolve, 3100))
      })

      // The timeout is 3000ms. It should return empty if it timeouts.
      // We'll simulate by checking if it resolves before the slow provider finishes.
      const start = Date.now()
      const items = await registry.getContextItems({ id: "s1", title: "Test", directory: "/" })
      const elapsed = Date.now() - start
      
      expect(items.length).toBe(0)
      expect(elapsed).toBeLessThan(3100) // Should have timed out at 3000ms
    }, 4000)
  })

  describe("Message Lifecycle Hooks", () => {
    test("fires onWillSendMessage", () => {
      const registry = new PluginRegistry()
      let fired = false
      
      registry.onWillSendMessage.event(e => {
        fired = true
        if (e.sessionId === "test") {
          e.cancel()
        }
      })

      let isCancelled = false
      registry.onWillSendMessage.fire({
        sessionId: "test",
        text: "hello",
        cancel: () => { isCancelled = true }
      })

      expect(fired).toBe(true)
      expect(isCancelled).toBe(true)
    })

    test("fires onDidCompleteMessage", () => {
      const registry = new PluginRegistry()
      let firedSession = ""
      
      registry.onDidCompleteMessage.event(e => {
        firedSession = e.sessionId
      })

      registry.onDidCompleteMessage.fire({ sessionId: "test" })
      expect(firedSession).toBe("test")
    })
  })
})
