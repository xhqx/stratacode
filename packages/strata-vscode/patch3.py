with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# Remove from variantKey to the end of handleStreamMessage
start_marker = "  const variantKey = (sel: ModelSelection) => {"
end_marker = "  function handleStreamMessage(message: ExtensionMessage): boolean {"
idx_start = content.find(start_marker)
idx_end = content.find(end_marker)
if idx_start != -1 and idx_end != -1:
    content = content[:idx_start] + content[idx_end:]

# Remove the modelSelectionsLoaded and other handlers inside the big unsub loop?
# Wait, those were already handled by individual vscode.onMessage blocks! Let's find them.
onmessage1 = """
  const unsubModels = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "modelSelectionsLoaded") return
    setStore("modelSelections", reconcile(message.selections))
  })
  vscode.postMessage({ type: "requestModelSelections" })
  onCleanup(unsubModels)
"""
onmessage2 = """
  const unsubVariants = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "variantSelectionsLoaded") return
    for (const [k, v] of Object.entries(message.selections)) {
      setStore("variantSelections", k, v)
    }
  })
  vscode.postMessage({ type: "requestVariantSelections" })
  onCleanup(unsubVariants)
"""
onmessage3 = """
  // Load persisted recent models from extension globalState
  const unsubRecents = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "recentsLoaded") return
    setStore("recentModels", message.recents)
  })
  vscode.postMessage({ type: "requestRecents" })
  onCleanup(unsubRecents)
"""
onmessage4 = """
  // Load persisted favorite models from extension globalState
  const unsubFavorites = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "favoritesLoaded") return
    setStore("favoriteModels", message.favorites)
  })
  vscode.postMessage({ type: "requestFavorites" })
  onCleanup(unsubFavorites)
"""

for block in [onmessage1, onmessage2, onmessage3, onmessage4]:
    # we need to be robust with whitespace
    # Let's just find and remove them manually with find
    idx = content.find(block.strip()[:50])
    if idx != -1:
        # Just use regex to strip out everything between "const unsubModels" and "onCleanup(unsubModels)"
        pass

import re
content = re.sub(r'  const unsubModels = vscode\.onMessage.*?onCleanup\(unsubModels\)\n+', '', content, flags=re.DOTALL)
content = re.sub(r'  const unsubVariants = vscode\.onMessage.*?onCleanup\(unsubVariants\)\n+', '', content, flags=re.DOTALL)
content = re.sub(r'  // Load persisted recent models from extension globalState\n  const unsubRecents = vscode\.onMessage.*?onCleanup\(unsubRecents\)\n+', '', content, flags=re.DOTALL)
content = re.sub(r'  // Load persisted favorite models from extension globalState\n  const unsubFavorites = vscode\.onMessage.*?onCleanup\(unsubFavorites\)\n+', '', content, flags=re.DOTALL)

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 3")
