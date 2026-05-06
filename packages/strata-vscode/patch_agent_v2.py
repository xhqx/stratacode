with open('webview-ui/src/context/agent-logic.tsx', 'r') as f:
    content = f.read()

# Add handleMessage for removeAgent
new_handle_message = """  function handleMessage(message: ExtensionMessage) {
    if (message.type === "agentsLoaded") {
      setAgents(message.agents)
      setAllAgents(message.allAgents ?? message.agents)

      const names = new Set(message.agents.map((a) => a.name))
      const pending = pendingAgentSelection()
      if (pending && !names.has(pending)) {
        setPendingAgentSelection(undefined)
      }
    } else if (message.type === "removeAgent") {
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
    }
  }"""

content = content.replace(
"""  function handleMessage(message: ExtensionMessage) {
    if (message.type === "agentsLoaded") {
      setAgents(message.agents)
      setAllAgents(message.allAgents ?? message.agents)

      const names = new Set(message.agents.map((a) => a.name))
      const pending = pendingAgentSelection()
      if (pending && !names.has(pending)) {
        setPendingAgentSelection(undefined)
      }
    }
  }""", new_handle_message)

with open('webview-ui/src/context/agent-logic.tsx', 'w') as f:
    f.write(content)

