import { describe, test, expect } from "bun:test"
import { ConfigACPProvider } from "../../src/stratacode/acp-client/config"
import { PREDEFINED } from "../../src/stratacode/acp-client/registry"
import { Schema } from "effect"

describe("ACP Client Provider Schema", () => {
  test("parses a valid stdio config", () => {
    const input = {
      command: ["python", "-m", "my_acp_agent"],
      env: { MY_API_KEY: "secret123" },
      cwd: "/tmp",
      transport: "stdio",
      trusted: true,
      model: "gemini-2.5-pro",
      enabled: true,
      predefined: true,
    }

    const parsed = Schema.decodeUnknownSync(ConfigACPProvider)(input)
    expect(parsed.command).toEqual(["python", "-m", "my_acp_agent"])
    expect(parsed.env).toEqual({ MY_API_KEY: "secret123" })
    expect(parsed.cwd).toBe("/tmp")
    expect(parsed.transport).toBe("stdio")
    expect(parsed.trusted).toBe(true)
    expect(parsed.model).toBe("gemini-2.5-pro")
    expect(parsed.enabled).toBe(true)
    expect(parsed.predefined).toBe(true)
  })

  test("parses a valid http config", () => {
    const input = {
      transport: "http",
      url: "http://localhost:3000/sse",
    }

    const parsed = Schema.decodeUnknownSync(ConfigACPProvider)(input)
    expect(parsed.transport).toBe("http")
    expect(parsed.url).toBe("http://localhost:3000/sse")
  })

  test("rejects invalid transport types", () => {
    const input = {
      transport: "websocket", // Invalid transport
      url: "ws://localhost:3000",
    }

    expect(() => Schema.decodeUnknownSync(ConfigACPProvider)(input)).toThrow()
  })

  test("defines built-in providers with commands and models", () => {
    for (const [key, item] of Object.entries(PREDEFINED)) {
      expect(key.length).toBeGreaterThan(0)
      expect(item.command.length).toBeGreaterThan(0)
      expect(item.models.length).toBeGreaterThan(0)
      expect(item.models.some((model: any) => model.id === item.default)).toBe(true)
    }
  })
})
