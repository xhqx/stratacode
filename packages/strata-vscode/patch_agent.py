with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

import re

# 1. Imports
content = content.replace(
    'import { createPermissionLogic } from "./permission-logic"',
    'import { createPermissionLogic } from "./permission-logic"\nimport { createAgentLogic } from "./agent-logic"'
)
content = content.replace('import { resolveSessionAgent } from "./session-agent"\n', '')

# 2. Instantiation
content = content.replace(
    '  const permissionLogic = createPermissionLogic({ vscode, showToast, language })',
    '  const permissionLogic = createPermissionLogic({ vscode, showToast, language })\n  const agentLogic = createAgentLogic({ vscode })'
)

# 3. State removal
content = content.replace("  const [agents, setAgents] = createSignal<AgentInfo[]>([])\n", "")
content = content.replace("  const [allAgents, setAllAgents] = createSignal<AgentInfo[]>([])\n", "")
content = content.replace("  const defaultAgent = createMemo(() => agents().find((a) => a.isDefault)?.name || \"code\")\n", "")
content = content.replace("  const agentNames = createMemo(() => new Set(agents().map((a) => a.name)))\n", "")
content = content.replace("  const [pendingAgentSelection, setPendingAgentSelection] = createSignal<string | undefined>()\n", "")

# 4. Remove agentSelections from store
content = content.replace("    agentSelections: {} as Record<string, string>,\n", "")

# 5. Remove message handlers and effects
# Note: unsubAgents is inside onCleanup(unsubAgents) but we can just let `agent-logic.tsx` handle its own unsub
unsub_agents_block = """  // Handle agentsLoaded immediately (not in onMount) so we never miss
  // the first agents list that may arrive before the DOM mounts.
  const unsubAgents = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "agentsLoaded") {
      return
    }
    setAgents(message.agents)
    setAllAgents(message.allAgents ?? message.agents)

    const names = new Set(message.agents.map((a) => a.name))
    // Reset pending selection if the agent no longer exists (e.g. after org switch)
    const pending = pendingAgentSelection()
    if (pending && !names.has(pending)) {
      setPendingAgentSelection(undefined)
    }
  })

"""
content = content.replace(unsub_agents_block, "")
content = content.replace("    unsubAgents()\n", "")

# Remove agents request from onMount
content = content.replace("    if (agents().length === 0) vscode.postMessage({ type: \"requestAgents\" })\n", "")

# 6. Use agentLogic where selectedAgentName is defined
content = content.replace(
"""  const selectedAgentName = createMemo(() => {
    const override = pendingAgentSelection()
    if (override && agents().some((a) => a.name === override)) return override
    return defaultAgent()
  })

  function selectAgent(name: string) {
    if (agents().some((a) => a.name === name)) {
      setPendingAgentSelection(name)
    }
  }""",
"  const { selectedAgentName, selectAgent, agents, allAgents, defaultAgent, agentNames } = agentLogic"
)

# 7. Update ModelSelectionDependencies
content = content.replace(
"""  const modelSelection = createModelSelectionLogic({
    currentSessionID,
    selectedAgentName,
    config,
    providers,
    connected,
    vscode,
    clearSessionError,
  })""",
"""  const modelSelection = createModelSelectionLogic({
    currentSessionID,
    selectedAgentName: agentLogic.selectedAgentName,
    config,
    providers,
    connected,
    vscode,
    clearSessionError,
  })"""
)

# 8. Update usages
content = content.replace("        if (store.agentSelections[sid]) continue\n        const agent = resolveSessionAgent(msgs, names)\n        if (agent) setStore(\"agentSelections\", sid, agent)", "        agentLogic.resolveMessagesAgent(sid, msgs)")

content = content.replace("""      // Transfer pending agent selection to the new session
      const pendingAgent = pendingAgentSelection()
      if (pendingAgent && !store.agentSelections[session.id]) {
        setStore("agentSelections", session.id, pendingAgent)
      }""", "      agentLogic.setPendingIfMissing(session.id)")

content = content.replace("""      const agent = resolveSessionAgent(merged, agentNames())
      if (agent) {
        setStore("agentSelections", sessionID, agent)
      }""", "      agentLogic.resolveMessagesAgent(sessionID, merged)")

content = content.replace("""    // agentNames() already excludes subagent/hidden agents, so subtask
    // assistant messages (e.g. "task" agent) are silently ignored.
    const agent = message.agent?.trim()
    if (agent && agentNames().has(agent)) {
      setStore("agentSelections", message.sessionID, agent)
    }""", "    agentLogic.handleNewMessageAgent(message.sessionID, message.agent)")

content = content.replace("""      if (pendingAgent && !store.agentSelections[session.id]) {
        setStore("agentSelections", session.id, pendingAgent)
      }""", "      agentLogic.setPendingIfMissing(session.id)")

content = content.replace("delete selections[agentName]", "agentLogic.removeSession(sessionID)")
# Actually wait, there is `delete selections[agentName]` on line 493 which is for model selections!
# And for agentSelections it was inside `removeSession`:
content = content.replace("""        delete selections[sessionID]
      }),
    )
    setStore(
      "agentSelections",
      produce((selections) => {
        delete selections[sessionID]
      }),
    )""", """        delete selections[sessionID]
      }),
    )
    agentLogic.removeSession(sessionID)""")

content = content.replace("""      agentSelections: {},
      modelSelections: {},""", """      modelSelections: {},""")
# Let's fix clearPendingPrompts and clearSessions
content = content.replace("        setStore(\"agentSelections\", {})\n", "        agentLogic.clearAllSessions()\n")
content = content.replace("      setStore(\"agentSelections\", {})\n", "      agentLogic.clearAllSessions()\n")

# Revert session agent override
content = content.replace("      setStore(\"agentSelections\", id, name)\n", "      agentLogic.setSessionAgent(id, name)\n")
content = content.replace("      setPendingAgentSelection(name)\n", "      agentLogic.setPendingAgentSelection(name)\n")

# In exports
content = content.replace("    selectAgent,\n    getSessionAgent: (sessionID: string) => store.agentSelections[sessionID] ?? defaultAgent(),\n", "    selectAgent,\n    getSessionAgent: agentLogic.getSessionAgent,\n")
content = content.replace("    setSessionAgent: (sessionID: string, name: string) => {\n      setStore(\"agentSelections\", sessionID, name)\n    },\n", "    setSessionAgent: agentLogic.setSessionAgent,\n")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

print("Agent logic patched")
