with open('webview-ui/src/context/model-selection-logic.tsx', 'r') as f:
    content = f.read()

import_replacements = """
import { createMemo, createSignal, onMount, createEffect } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { ModelSelection, Provider } from "../types/messages"
import { resolveModelSelection } from "./model-selection"
import { parseModelString } from "../../../src/shared/provider-model"
import { useVSCode } from "./vscode"
import type { ExtensionMessage } from "../types/messages/extension-messages"
"""

lines = content.split('\n')
# remove the first 10 lines
content = import_replacements.strip() + '\n\n' + '\n'.join(lines[10:])

# replace vscode: VSCodeWrapper with vscode: ReturnType<typeof useVSCode>
content = content.replace("vscode: VSCodeWrapper", "vscode: ReturnType<typeof useVSCode>")

with open('webview-ui/src/context/model-selection-logic.tsx', 'w') as f:
    f.write(content)

print("Updated Phase 12")
