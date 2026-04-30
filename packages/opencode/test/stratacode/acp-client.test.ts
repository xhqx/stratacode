import { describe, test, expect } from "bun:test"
import { ConfigACPAgent } from "../../src/stratacode/acp-client/config"
import { Schema } from "effect"
import { Effect } from "effect"

describe("ACP Client Configuration Schema", () => {
  test("parses a valid stdio config", () => {
    const input = {
      command: ["python", "-m", "my_acp_agent"],
      env: { MY_API_KEY: "secret123" },
      cwd: "/tmp",
      transport: "stdio",
      trusted: true,
    }

    const parsed = Schema.decodeUnknownSync(ConfigACPAgent)(input)
    expect(parsed.command).toEqual(["python", "-m", "my_acp_agent"])
    expect(parsed.env).toEqual({ MY_API_KEY: "secret123" })
    expect(parsed.cwd).toBe("/tmp")
    expect(parsed.transport).toBe("stdio")
    expect(parsed.trusted).toBe(true)
  })

  test("parses a valid http config", () => {
    const input = {
      transport: "http",
      url: "http://localhost:3000/sse",
    }

    const parsed = Schema.decodeUnknownSync(ConfigACPAgent)(input)
    expect(parsed.transport).toBe("http")
    expect(parsed.url).toBe("http://localhost:3000/sse")
  })

  test("rejects invalid transport types", () => {
    const input = {
      transport: "websocket", // Invalid transport
      url: "ws://localhost:3000",
    }

    expect(() => Schema.decodeUnknownSync(ConfigACPAgent)(input)).toThrow()
  })
})
