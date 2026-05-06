with open('webview-ui/src/context/session.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "  const variantList = () => {" in line:
        skip = True
    if "  function handleStreamMessage(" in line:
        skip = False
    
    if not skip:
        new_lines.append(line)

content = "".join(new_lines)

# replace selected() remaining cases and store.sessionOverrides
content = content.replace("selected()", "modelSelection.selected()")
content = content.replace("store.sessionOverrides", "modelSelection.store.sessionOverrides")
content = content.replace("modelSelection.modelSelection.selected()", "modelSelection.selected()")

with open('webview-ui/src/context/session.tsx', 'w') as f:
    f.write(content)
print("Updated session.tsx Phase 6")
