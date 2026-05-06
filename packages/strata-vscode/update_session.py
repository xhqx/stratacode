import re

with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# 1. Add import
if 'import { createModelSelectionLogic }' not in content:
    content = content.replace(
        'import { useConfig } from "./config"',
        'import { useConfig } from "./config"\nimport { createModelSelectionLogic } from "./model-selection"'
    )

# 2. Remove fields from SessionStore interface
content = re.sub(
    r'\s*modelSelections:\s*Record<string,\s*ModelSelection\s*\|\s*null>.*?//.*?\n',
    '\n',
    content
)
content = re.sub(
    r'\s*sessionOverrides:\s*Record<string,\s*ModelSelection>.*?//.*?\n',
    '\n',
    content
)
content = re.sub(
    r'\s*variantSelections:\s*Record<string,\s*string>.*?//.*?\n',
    '\n',
    content
)
content = re.sub(
    r'\s*recentModels:\s*ModelSelection\[\].*?\n',
    '\n',
    content
)
content = re.sub(
    r'\s*favoriteModels:\s*ModelSelection\[\].*?\n',
    '\n',
    content
)

# 3. Remove userSetAgents state
content = re.sub(
    r'\s*// Tracks whether the user has explicitly set a model override per agent.*?\n\s*const \[userSetAgents, setUserSetAgents\] = createSignal<Record<string, boolean>>\(\{\}\)\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 4. Remove initial store values
content = re.sub(
    r'\s*modelSelections:\s*\{\},',
    '',
    content
)
content = re.sub(
    r'\s*sessionOverrides:\s*\{\},',
    '',
    content
)
content = re.sub(
    r'\s*variantSelections:\s*\{\},',
    '',
    content
)
content = re.sub(
    r'\s*recentModels:\s*\[\],',
    '',
    content
)
content = re.sub(
    r'\s*favoriteModels:\s*\[\],',
    '',
    content
)

# 5. Insert modelSelection instantiation
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
"""
if 'createModelSelectionLogic' not in content[content.find('const selectedAgentName = createMemo<string>'):]:
    content = content.replace(
        '  const selectedAgentName = createMemo<string>(() => {',
        instantiation + '\n  const selectedAgentName = createMemo<string>(() => {'
    )

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 1")
