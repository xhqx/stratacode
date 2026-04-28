import * as vscode from "vscode"

export class StrataCodeActionProvider implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorRewrite],
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (range.isEmpty) return []

    const actions: vscode.CodeAction[] = []

    const add = new vscode.CodeAction("Add to Strata Code", vscode.CodeActionKind.RefactorRewrite)
    add.command = { command: "strata-code.new.addToContext", title: "Add to Strata Code" }
    actions.push(add)

    const hasDiagnostics = context.diagnostics.length > 0

    if (hasDiagnostics) {
      const fix = new vscode.CodeAction("Fix with Strata Code", vscode.CodeActionKind.QuickFix)
      fix.command = { command: "strata-code.new.fixCode", title: "Fix with Strata Code" }
      fix.isPreferred = true
      actions.push(fix)
    }

    if (!hasDiagnostics) {
      const explain = new vscode.CodeAction("Explain with Strata Code", vscode.CodeActionKind.RefactorRewrite)
      explain.command = { command: "strata-code.new.explainCode", title: "Explain with Strata Code" }
      actions.push(explain)

      const improve = new vscode.CodeAction("Improve with Strata Code", vscode.CodeActionKind.RefactorRewrite)
      improve.command = { command: "strata-code.new.improveCode", title: "Improve with Strata Code" }
      actions.push(improve)
    }

    return actions
  }
}
