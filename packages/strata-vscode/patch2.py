import re

with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# 1. Insert modelSelection
instantiation = """
  const modelSelection = createModelSelectionLogic({
    currentSessionID,
    selectedAgentName,
    config,
    providers: provider.providers,
    providerConnected: provider.connected,
    vscode,
    clearSessionError: (sid) => setStore("messages", sid, (msgs = []) => msgs.filter((m) => !m.error)),
  })

  const agentNames = createMemo(() => new Set(agents().map((agent) => agent.name)))
"""
content = content.replace('  const agentNames = createMemo(() => new Set(agents().map((agent) => agent.name)))\n', instantiation)

# 2. Remove the giant block of model selection logic
# From /** Per-mode model from config to the end of clearModelOverride
start_marker = "  /** Per-mode model from config (e.g. config.agent.code.model). */"
end_marker = "  // Handle agentsLoaded immediately (not in onMount) so we never miss"
idx_start = content.find(start_marker)
idx_end = content.find(end_marker)
if idx_start != -1 and idx_end != -1:
    content = content[:idx_start] + content[idx_end:]

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 2.1")
