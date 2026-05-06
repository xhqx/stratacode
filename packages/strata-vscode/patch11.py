with open('webview-ui/src/context/model-selection-logic.tsx', 'r') as f:
    content = f.read()

# Replace variants usage
old_variant_list = """  function variantList(): string[] {
    const sel = selected()
    if (!sel) return []
    const prov = deps.providers()?.[sel.providerID]
    if (!prov) return []
    const model = prov.models?.[sel.modelID]
    if (!model) return []
    if (!model.variants) return []
    const order = model.variants.order || []
    const available = Object.keys(model.variants.models || {})
    const set = new Set(order)
    for (const a of available) {
      if (!set.has(a)) order.push(a)
    }
    return order
  }"""
new_variant_list = """  function variantList(): string[] {
    const sel = selected()
    if (!sel) return []
    const prov = deps.providers()?.[sel.providerID]
    if (!prov) return []
    const model = prov.models?.[sel.modelID]
    if (!model) return []
    if (!model.variants) return []
    const vData = model.variants as unknown as { order?: string[]; models?: Record<string, unknown>; default?: string }
    const order = vData.order || []
    const available = Object.keys(vData.models || {})
    const set = new Set(order)
    for (const a of available) {
      if (!set.has(a)) order.push(a)
    }
    return order
  }"""
content = content.replace(old_variant_list, new_variant_list)

old_current_variant = """  function currentVariant(): string | undefined {
    const sel = selected()
    if (!sel) return undefined
    const prov = deps.providers()?.[sel.providerID]
    const modelDef = prov?.models?.[sel.modelID]
    if (!modelDef?.variants) return undefined
    const stored = store.variantSelections[variantKey(sel)]
    if (stored && modelDef.variants.models[stored]) return stored
    const defaultVar = modelDef.variants.default
    if (defaultVar && modelDef.variants.models[defaultVar]) return defaultVar
    return undefined
  }"""
new_current_variant = """  function currentVariant(): string | undefined {
    const sel = selected()
    if (!sel) return undefined
    const prov = deps.providers()?.[sel.providerID]
    const modelDef = prov?.models?.[sel.modelID]
    if (!modelDef?.variants) return undefined
    const vData = modelDef.variants as unknown as { order?: string[]; models?: Record<string, unknown>; default?: string }
    const stored = store.variantSelections[variantKey(sel)]
    if (stored && vData.models?.[stored]) return stored
    const defaultVar = vData.default
    if (defaultVar && vData.models?.[defaultVar]) return defaultVar
    return undefined
  }"""
content = content.replace(old_current_variant, new_current_variant)

with open('webview-ui/src/context/model-selection-logic.tsx', 'w') as f:
    f.write(content)

print("Updated Phase 11")
