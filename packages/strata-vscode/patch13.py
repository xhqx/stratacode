with open('webview-ui/src/context/model-selection-logic.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'deps.vscode.postMessage({ type: "persistVariantSelection", providerID: sel.providerID, modelID: sel.modelID, variant: value })',
    'deps.vscode.postMessage({ type: "persistVariant", key, value })'
)

content = content.replace(
    'deps.vscode.postMessage({ type: "persistFavorites", favorites: updated })',
    'const action = idx >= 0 ? "remove" : "add";\n    deps.vscode.postMessage({ type: "toggleFavorite", action, providerID, modelID })'
)

with open('webview-ui/src/context/model-selection-logic.tsx', 'w') as f:
    f.write(content)

print("Updated Phase 13")
