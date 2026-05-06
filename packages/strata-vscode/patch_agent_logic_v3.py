with open('webview-ui/src/context/agent-logic.tsx', 'r') as f:
    content = f.read()

import re

# Remove the fake removeAgent handler
fake_handler = """    } else if (message.type === "removeAgent") {
      const name = message.agent
      setAgents((prev) => prev.filter((a) => a.name !== name))

      // Clear stale selections so selectedAgentName() falls back to the default
      if (pendingAgentSelection() === name) {
        setPendingAgentSelection(undefined)
      }
      setStore(
        "agentSelections",
        produce((selections: any) => {
          for (const sid of Object.keys(selections)) {
            if (selections[sid] === name) delete selections[sid]
          }
        })
      )
    }"""
content = content.replace(fake_handler, "    }")

# Add removeMode function
remove_mode = """  function removeMode(name: string) {
    setAgents((prev) => prev.filter((a) => a.name !== name))

    if (pendingAgentSelection() === name) {
      setPendingAgentSelection(undefined)
    }
    setStore(
      "agentSelections",
      produce((selections: any) => {
        for (const sid of Object.keys(selections)) {
          if (selections[sid] === name) delete selections[sid]
        }
      })
    )
    deps.vscode.postMessage({ type: "removeMode", name })
  }

  return {"""
content = content.replace("  return {", remove_mode)

# Export removeMode
content = content.replace("    setPendingAgentSelection,\n  }", "    setPendingAgentSelection,\n    removeMode,\n  }")

with open('webview-ui/src/context/agent-logic.tsx', 'w') as f:
    f.write(content)

