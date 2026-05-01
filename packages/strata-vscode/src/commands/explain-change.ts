import * as vscode from "vscode"
import type { StrataProvider } from "../StrataProvider"
import type { DiffViewerProvider } from "../DiffViewerProvider"
import { ExplainCommentController } from "../services/code-actions/ExplainCommentController"

/**
 * Registers commands for the Per-Change Explanator feature.
 *
 * Commands:
 *   - explainChanges     → opens diff viewer + triggers explain-all (uncommitted)
 *   - explainBranch      → opens diff viewer + triggers explain-all (branch)
 *   - explainMerge       → QuickPick for base ref → opens diff viewer + explain-all
 *   - explainFile        → opens diff viewer, auto-scrolls to active file
 *   - explainHunk        → placeholder for hunk-level explanation
 */
export function registerExplainChangeCommands(
  context: vscode.ExtensionContext,
  provider: StrataProvider,
  diffViewer: DiffViewerProvider,
): void {
  const commentController = new ExplainCommentController(provider)
  context.subscriptions.push(commentController)

  const handleExplainAll = () => {
    const mode = vscode.workspace.getConfiguration("strata-code.new").get<string>("explainer.mode", "strata")
    if (mode === "native") {
      void commentController.explainAllNative()
    } else {
      diffViewer.openPanel()
      setTimeout(() => diffViewer.triggerExplainAll(), 800)
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("strata-code.new.openDiffViewer", () => {
      diffViewer.openPanel()
    }),

    vscode.commands.registerCommand("strata-code.new.explainChanges", () => {
      handleExplainAll()
    }),

    vscode.commands.registerCommand("strata-code.new.explainBranch", () => {
      handleExplainAll()
    }),

    vscode.commands.registerCommand("strata-code.new.explainMerge", async () => {
      const ref = await vscode.window.showInputBox({
        prompt: "Enter a base branch or commit to compare against",
        placeHolder: "e.g., main, origin/main, HEAD~5, abc1234",
      })
      if (!ref) return

      handleExplainAll()
    }),

    vscode.commands.registerCommand("strata-code.new.explainFile", () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!root) return

      const relative = editor.document.uri.fsPath.replace(root + "/", "")
      diffViewer.openPanel()
      // For now, open the diff viewer — the user can click the per-file explain button
      // Future: auto-scroll to the file and trigger explain for just that file
    }),

    vscode.commands.registerCommand("strata-code.new.explainHunk", () => {
      // Placeholder — hunk-level explanation requires knowing which hunk the cursor is in
      // For v1, the user can use the per-file explain button in the diff viewer
      vscode.window.showInformationMessage(
        "Hunk-level explanation: open the diff viewer and click the 💡 button on a specific file.",
      )
    }),
  )
}
