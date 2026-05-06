with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# Fix defaultAgent() -> agentLogic.defaultAgent()
content = content.replace("defaultAgent()", "agentLogic.defaultAgent()")
content = content.replace("defaultAgent,", "defaultAgent: agentLogic.defaultAgent,")

# Fix agents() -> agentLogic.agents()
content = content.replace("agents().map", "agentLogic.agents().map")

# Fix setAgents, setAllAgents, setDefaultAgent
content = content.replace("      setAgents(message.agents)\n      setAllAgents(message.allAgents ?? message.agents)\n      setDefaultAgent(message.agents.find((a) => a.isDefault)?.name || \"code\")\n", "")
# Wait, let's see if there is another setAgents
content = content.replace("    setAgents(message.agents)\n", "")
content = content.replace("    setAllAgents(message.allAgents ?? message.agents)\n", "")
content = content.replace("    setDefaultAgent(message.agents.find((a) => a.isDefault)?.name || \"code\")\n", "")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

