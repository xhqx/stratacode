with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# 1. selectAgent overrides deletion
old_select_agent_overrides = """      setStore(
        "sessionOverrides",
        produce((overrides) => {
          delete overrides[id]
        }),
      )"""
new_select_agent_overrides = """      modelSelection.setStore(
        "sessionOverrides",
        produce((overrides) => {
          delete overrides[id]
        }),
      )"""
content = content.replace(old_select_agent_overrides, new_select_agent_overrides)

# 2. selectAgent modelSelections fallback
old_select_agent_model_fallback = """      if (!userSetAgents()[name] && !store.modelSelections[name]) {
        setStore("modelSelections", name, resolveModel(name))
      }"""
new_select_agent_model_fallback = """      if (!modelSelection.userSetAgents()[name] && !modelSelection.store.modelSelections[name]) {
        modelSelection.setStore("modelSelections", name, modelSelection.resolveModel(name))
      }"""
content = content.replace(old_select_agent_model_fallback, new_select_agent_model_fallback)

# 3. selected() in compact
content = content.replace('    const sel = selected()\n    vscode.postMessage({\n      type: "compact",', '    const sel = modelSelection.selected()\n    vscode.postMessage({\n      type: "compact",')

# 4. selected() in something else? (Line 2008)
content = content.replace('      const sel = selected()\n      msgProviderID = sel?.providerID', '      const sel = modelSelection.selected()\n      msgProviderID = sel?.providerID')

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 5")
