# Mermaid Diagram Features

**Priority:** P2

No mermaid rendering exists in the VS Code extension or strata-ui.

## Location (stratacode-legacy)

These components exist in the [stratacode-legacy](https://github.com/Strata-Org/stratacode-legacy) repo, not in this extension:

- `webview-ui/src/components/common/MermaidBlock.tsx`
- `webview-ui/src/components/common/MermaidButton.tsx`

## Remaining Work

- Mermaid diagram rendering in chat messages (code blocks with `mermaid` language tag)
- "Fix with AI" button for mermaid syntax errors — route to CLI
- Copy button for diagram code
- Click to open rendered diagram as PNG in editor
- Error expansion with original code display
- Loading states during processing
