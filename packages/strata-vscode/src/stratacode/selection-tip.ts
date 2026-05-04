import * as vscode from "vscode"

export function tipText(platform: string): string {
  return platform === "darwin" ? "⌘I — Add to Strata Chat" : "Ctrl+I — Add to Strata Chat"
}

export function eligible(enabled: boolean, count: number, isEmpty: boolean): boolean {
  if (!enabled) return false
  if (count >= 5) return false
  if (isEmpty) return false
  return true
}

export class SelectionTipService implements vscode.Disposable {
  private decoration: vscode.TextEditorDecorationType
  private timer: ReturnType<typeof setTimeout> | undefined
  private editor: vscode.TextEditor | undefined
  private subs: vscode.Disposable[] = []

  constructor(private context: vscode.ExtensionContext) {
    this.decoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: " " + tipText(process.platform),
        color: new vscode.ThemeColor("editorGhostText.foreground"),
        fontStyle: "italic",
        margin: "0 0 0 2em",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    })

    this.subs.push(
      vscode.window.onDidChangeTextEditorSelection((e) => this.onSelection(e)),
      vscode.workspace.onDidChangeConfiguration((e) => this.onConfig(e)),
    )
  }

  private onSelection(e: vscode.TextEditorSelectionChangeEvent) {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }

    if (this.editor && this.editor !== e.textEditor) {
      this.editor.setDecorations(this.decoration, [])
    }

    const enabled = vscode.workspace.getConfiguration().get<boolean>("strata-code.new.features.selectionTip") ?? true
    const count = this.context.globalState.get<number>("strata.selectionTipUsageCount") ?? 0

    const selection = e.selections[0]

    if (!eligible(enabled, count, !selection || selection.isEmpty)) {
      this.clear()
      return
    }

    this.timer = setTimeout(() => {
      // Re-check after timeout in case selection changed
      const currentSelection = e.textEditor.selection
      if (!currentSelection || currentSelection.isEmpty) {
        this.clear()
        return
      }

      const range = new vscode.Range(currentSelection.end, currentSelection.end)
      e.textEditor.setDecorations(this.decoration, [{ range }])
      this.editor = e.textEditor
    }, 500)
  }

  private async onConfig(e: vscode.ConfigurationChangeEvent) {
    if (e.affectsConfiguration("strata-code.new.features.selectionTip")) {
      const enabled = vscode.workspace.getConfiguration().get<boolean>("strata-code.new.features.selectionTip") ?? true
      if (enabled) {
        await this.context.globalState.update("strata.selectionTipUsageCount", 0)
      } else {
        this.clear()
      }
    }
  }

  public async recordUsage() {
    const count = this.context.globalState.get<number>("strata.selectionTipUsageCount") ?? 0
    await this.context.globalState.update("strata.selectionTipUsageCount", count + 1)
    if (count + 1 >= 5) {
      this.clear()
    }
  }

  private clear() {
    if (this.editor) {
      this.editor.setDecorations(this.decoration, [])
      this.editor = undefined
    }
  }

  public dispose() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.clear()
    this.decoration.dispose()
    for (const sub of this.subs) {
      sub.dispose()
    }
    this.subs = []
  }
}
