with open('webview-ui/src/context/model-selection.tsx', 'r') as f:
    content = f.read()

effect = """
  // Keep model selection in sync with provider/mode default until the user
  // explicitly overrides it.
  import { createEffect } from "solid-js"
  
  createEffect(() => {
    const agentName = deps.selectedAgentName()
    if (userSetAgents()[agentName]) return
    const sel = resolveModel(agentName)
    setStore("modelSelections", agentName, sel)
  })
"""

# add createEffect to imports
if 'createEffect' not in content:
    content = content.replace('import { createMemo, createSignal, onMount } from "solid-js"', 'import { createMemo, createSignal, onMount, createEffect } from "solid-js"')

# insert effect after resolveModel
if 'createEffect(() => {' not in content:
    content = content.replace(
        '  const selected = createMemo',
        '  createEffect(() => {\n    const agentName = deps.selectedAgentName()\n    if (userSetAgents()[agentName]) return\n    const sel = resolveModel(agentName)\n    setStore("modelSelections", agentName, sel)\n  })\n\n  const selected = createMemo'
    )

with open('webview-ui/src/context/model-selection.tsx', 'w') as f:
    f.write(content)
