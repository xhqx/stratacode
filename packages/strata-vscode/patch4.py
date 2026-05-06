with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

replacements = {
    'selected,': 'selected: modelSelection.selected,',
    'selectModel,': 'selectModel: modelSelection.selectModel,',
    'hasModelOverride,': 'hasModelOverride: modelSelection.hasModelOverride,',
    'clearModelOverride,': 'clearModelOverride: modelSelection.clearModelOverride,',
    'variantList,': 'variantList: modelSelection.variantList,',
    'currentVariant,': 'currentVariant: modelSelection.currentVariant,',
    'selectVariant,': 'selectVariant: modelSelection.selectVariant,',
    'favoriteModels: () => store.favoriteModels,': 'favoriteModels: modelSelection.favoriteModels,',
    'toggleFavorite,': 'toggleFavorite: modelSelection.toggleFavorite,',
    
    # getSessionModel inside the return object
    'return resolveModel(agentName, store.modelSelections[agentName])': 'return modelSelection.resolveModel(agentName, modelSelection.store.modelSelections[agentName])',
    
    # setSessionModel inside the return object
    'setStore("sessionOverrides", sessionID, { providerID, modelID })': 'modelSelection.setStore("sessionOverrides", sessionID, { providerID, modelID })',
}

# we need to be careful. `selected,` might match multiple places. But there's only one in `const value: SessionContextValue = {`
# let's just do it
for k, v in replacements.items():
    content = content.replace(k, v)

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 4")
