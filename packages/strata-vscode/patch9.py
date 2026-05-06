with open('webview-ui/src/context/model-selection-logic.tsx', 'r') as f:
    content = f.read()

import_replacements = """
import { createMemo, createSignal, onMount, createEffect } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { ModelSelection } from "../types/messages"
import { parseModelString, resolveModelSelection } from "./provider-utils"
import type { VSCodeWrapper } from "../utils/vscode"
import type { ProviderCatalog } from "../types/messages"
import type { ExtensionMessage } from "../types/messages/extension-messages"
"""

# replace first 10 lines
lines = content.split('\n')
content = import_replacements.strip() + '\n\n' + '\n'.join(lines[10:])

content = content.replace("vscode: VSCodeAPI", "vscode: VSCodeWrapper")

# Wait, is ProviderCatalog in `../types/messages`? Let's check `provider-utils.ts` to see what type `providers` should be.
