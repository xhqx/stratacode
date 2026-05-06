import re

with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

def remove_block(start_regex, end_regex):
    global content
    match_start = re.search(start_regex, content)
    if not match_start: return
    match_end = re.search(end_regex, content[match_start.start():])
    if not match_end: return
    content = content[:match_start.start()] + content[match_start.start() + match_end.end():]

remove_block(r'  /\*\* Per-mode model from config.*?\n  function getModeModel', r'  \}\n')
remove_block(r'  /\*\* Global default model from config.*?\n  function getGlobalModel', r'  \}\n')
remove_block(r'  function resolveModel\(', r'  \}\n')
remove_block(r'  // Keep model selection in sync with provider/mode default.*?\n  createEffect\(\(\) => \{.*?\n    const sel = resolveModel\(agentName\)\n    setStore\("modelSelections", agentName, sel\)\n  \}\)\n', r'')
# regex for selected
content = re.sub(r'  // Global model selection per agent/mode.*?\n  // Precedence:.*?\n  // Each candidate.*?\n  const selected = createMemo<ModelSelection \| null>\(\(\) => \{.*?\n      if \(session\) return session\n    \}\n    const agentName = selectedAgentName\(\)\n    return resolveModel\(agentName, store.modelSelections\[agentName\]\)\n  \}\)\n', '', content, flags=re.DOTALL)

remove_block(r'  function pushRecent\(', r'  \}\n')
remove_block(r'  function applyModel\(', r'  \}\n')
remove_block(r'  function selectModel\(', r'  \}\n')
remove_block(r'  /\*\* The config/default model for the current mode.*?\n  const configModel = createMemo', r'  \}\)\n')
remove_block(r'  /\*\* True when the active model differs from what the config dictates.*?\n  const hasModelOverride = createMemo', r'  \}\)\n')
remove_block(r'  /\*\* Clear the per-mode model override, falling back to config default.*?\n  function clearModelOverride\(\)', r'      \)\n    \}\n  \}\n')

remove_block(r'  const variantKey = \(sel: ModelSelection\) =>', r'`\n')
remove_block(r'  const variantList = \(\) => \{', r'    return order\n  \}\n')
remove_block(r'  const currentVariant = \(\) => \{', r'    return undefined\n  \}\n')
remove_block(r'  function selectVariant\(', r'  \}\n')

# The onMessages:
content = re.sub(r'  const unsubModels = vscode.onMessage\(\(message: ExtensionMessage\) => \{\n    if \(message.type !== "modelSelectionsLoaded"\) return\n    setStore\("modelSelections", reconcile\(message.selections\)\)\n  \}\)\n  vscode.postMessage\(\{ type: "requestModelSelections" \}\)\n  onCleanup\(unsubModels\)\n\n', '', content)
content = re.sub(r'  const unsubVariants = vscode.onMessage\(\(message: ExtensionMessage\) => \{\n    if \(message.type !== "variantSelectionsLoaded"\) return\n    for \(const \[k, v\] of Object.entries\(message.selections\)\) \{\n      setStore\("variantSelections", k, v\)\n    \}\n  \}\)\n  vscode.postMessage\(\{ type: "requestVariantSelections" \}\)\n  onCleanup\(unsubVariants\)\n\n', '', content)
content = re.sub(r'  // Load persisted recent models from extension globalState\n  const unsubRecents = vscode.onMessage\(\(message: ExtensionMessage\) => \{\n    if \(message.type !== "recentsLoaded"\) return\n    setStore\("recentModels", message.recents\)\n  \}\)\n  vscode.postMessage\(\{ type: "requestRecents" \}\)\n  onCleanup\(unsubRecents\)\n\n', '', content)
content = re.sub(r'  // Load persisted favorite models from extension globalState\n  const unsubFavorites = vscode.onMessage\(\(message: ExtensionMessage\) => \{\n    if \(message.type !== "favoritesLoaded"\) return\n    setStore\("favoriteModels", message.favorites\)\n  \}\)\n  vscode.postMessage\(\{ type: "requestFavorites" \}\)\n  onCleanup\(unsubFavorites\)\n', '', content)

remove_block(r'  function toggleFavorite\(', r'  \}\n')

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 2")
