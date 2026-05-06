with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# Remove defaultAgent signal
content = content.replace("  const [defaultAgent, setDefaultAgent] = createSignal(\"code\")\n", "")

# Remove removeMode function
remove_mode = """  const removeMode = (name: string) => {
    setAgents((prev) => prev.filter((a) => a.name !== name))

    // Clear stale selections so selectedAgentName() falls back to the default
    if (pendingAgentSelection() === name) {
      setPendingAgentSelection(null)
    }
    setStore(
      "agentSelections",
      produce((selections) => {
        for (const sid of Object.keys(selections)) {
          if (selections[sid] === name) delete selections[sid]
        }
      }),
    )
  }

"""
content = content.replace(remove_mode, "")

# Remove removeMode case from handleExtensionMessage
remove_agent_case = """      case "removeAgent":
        removeMode(message.agent)
        break
"""
content = content.replace(remove_agent_case, "")

# Fix errors on line 2108: `agents,` -> `agents: agentLogic.agents,`
content = content.replace("    agents,\n", "    agents: agentLogic.agents,\n")
content = content.replace("    allAgents,\n", "    allAgents: agentLogic.allAgents,\n")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

