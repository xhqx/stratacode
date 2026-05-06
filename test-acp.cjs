const { spawn } = require("child_process");
const child = spawn("gemini", ["--acp"], {
  env: { 
    ...process.env, 
    STRATA_DISABLE_DEFAULT_PLUGINS: "1",
    STRATA_DISABLE_PROJECT_CONFIG: "1"
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const parts = buffer.split("\n");
  buffer = parts.pop() ?? "";
  for (const line of parts) {
    let cleanLine = line.trim();
    if (!cleanLine) continue;
    const bracketIndex = cleanLine.indexOf("{");
    if (bracketIndex > 0) {
      cleanLine = cleanLine.substring(bracketIndex);
    }
    console.log("TRY PARSE:", cleanLine);
    try {
      const msg = JSON.parse(cleanLine);
      console.log("PARSED ID:", msg.id, "METHOD:", msg.method);
      if (msg.id === 1) {
        console.log("SENDING session/new");
        child.stdin.write(JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: process.cwd(), mcpServers: [] }
        }) + "\n");
      }
      if (msg.id === 2) {
        console.log("SUCCESS!", JSON.stringify(msg.result).substring(0, 50));
        child.kill();
      }
    } catch (e) {
      console.log("PARSE ERROR", e.message);
    }
  }
});
child.stderr.on("data", chunk => console.log("STDERR:", chunk.toString()));
child.on("error", err => console.log("ERROR:", err));
child.on("exit", code => console.log("EXIT:", code));

child.stdin.write(JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: 1, clientInfo: { name: "stratacode", version: "1.0.0" }, clientCapabilities: {}
  }
}) + "\n");
