with open('webview-ui/src/context/model-selection-logic.tsx', 'r') as f:
    content = f.read()

# Fix providerConnected to connected and boolean to string[]
content = content.replace("providerConnected: Accessor<boolean>", "connected: Accessor<string[]>")
content = content.replace("connected: deps.providerConnected(),", "connected: deps.connected(),")

# Fix variantsLoaded
content = content.replace('message.type === "variantSelectionsLoaded"', 'message.type === "variantsLoaded"')
content = content.replace('for (const [k, v] of Object.entries(message.selections)) {', 'for (const [k, v] of Object.entries((message as any).variants)) {')
# We need to make sure message has .variants. TS narrowing might work if we just check message.type === "variantsLoaded", but to be safe we can use (message as any) if needed, or if ExtensionMessage defines it properly, it will just work. Let's cast it to any just to be safe, or wait, it's checked by TS.
content = content.replace('Object.entries((message as any).variants)', 'Object.entries(message.variants)')

with open('webview-ui/src/context/model-selection-logic.tsx', 'w') as f:
    f.write(content)

with open('webview-ui/src/context/session.tsx', 'r') as f:
    content2 = f.read()

content2 = content2.replace("providerConnected: provider.connected,", "connected: provider.connected,")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content2)

print("Updated Phase 8")
