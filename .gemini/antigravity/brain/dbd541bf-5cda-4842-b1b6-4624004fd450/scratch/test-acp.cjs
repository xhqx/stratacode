#!/usr/bin/env node
const { spawn } = require("child_process")

const child = spawn("gemini", ["--acp"], {
  stdio: ["pipe", "pipe", "pipe"],
})

let id = 0
const send = (method, params = {}) => {
  const msg = { jsonrpc: "2.0", id: ++id, method, params }
  console.log(`\n>>> SEND [${id}]: ${method}`)
  child.stdin.write(JSON.stringify(msg) + "\n")
}

let buffer = ""
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString()
  const lines = buffer.split("\n")
  buffer = lines.pop() ?? ""
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      console.log(`<<< RECV [${msg.id}]:`, JSON.stringify(msg, null, 2).slice(0, 800))

      if (msg.id === 1 && msg.result) {
        // Try different session methods
        send("session/new", { cwd: process.cwd(), mcpServers: [] })
        send("newSession", { cwd: process.cwd(), mcpServers: [] })
        send("models/list", {})
        send("agent/listModels", {})
        send("listModels", {})
      }

      // If we get models back from any method, show them
      if (msg.result && (msg.result.models || msg.result.availableModels)) {
        console.log("\n=== MODELS FOUND ===")
        console.log(JSON.stringify(msg.result.models || msg.result.availableModels, null, 2))
        child.kill()
        process.exit(0)
      }
    } catch (e) {
      console.log("RAW:", line)
    }
  }
})

child.stderr.on("data", (chunk) => {
  const txt = chunk.toString().trim()
  if (txt) console.log("STDERR:", txt)
})

child.on("exit", (code) => {
  console.log("EXIT:", code)
})

send("initialize", {
  protocolVersion: 1,
  clientInfo: { name: "test", version: "1.0.0" },
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
  },
})

setTimeout(() => {
  console.log("\nTIMEOUT")
  child.kill()
  process.exit(1)
}, 10000)
