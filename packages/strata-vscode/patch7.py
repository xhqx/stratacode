with open('webview-ui/src/context/session.tsx', 'r') as f:
    content = f.read()

# 2. Add type to sid
content = content.replace("clearSessionError: (sid) =>", "clearSessionError: (sid: string) =>")

# 3. Add handleError back
handleErrorFunc = """
  function handleError(message: Extract<ExtensionMessage, { type: "error" }>) {
    if (!message.sessionID || message.sessionID === currentSessionID()) setLoading(false)
    if (message.sessionID) patchPage(message.sessionID, { loadingInitial: false, loadingOlder: false })
  }
"""
# insert handleErrorFunc before function handleStreamMessage
content = content.replace("  function handleStreamMessage(", handleErrorFunc + "\n  function handleStreamMessage(")

# 4. Fix overrides type
content = content.replace("produce((overrides) => {\n          delete overrides[id]", "produce((overrides: any) => {\n          delete overrides[id]")

# 5. Fix currentVariant
content = content.replace("currentVariant()", "modelSelection.currentVariant()")
# Wait, I already did this replacement? I should replace just `currentVariant` with `modelSelection.currentVariant`?
# Let's see if it's called as `currentVariant()`.
content = content.replace("const variant = currentVariant()", "const variant = modelSelection.currentVariant()")
content = content.replace("variant: currentVariant(),", "variant: modelSelection.currentVariant(),")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)

# check export in model-selection.tsx
with open('webview-ui/src/context/model-selection.tsx', 'r') as f:
    model_content = f.read()

if "export function createModelSelectionLogic" not in model_content:
    print("Export missing!")
else:
    print("Export is present")

print("Updated session.tsx Phase 7")
