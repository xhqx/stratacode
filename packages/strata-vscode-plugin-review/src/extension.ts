import * as vscode from "vscode"
import type { StrataPluginAPI } from "@stratacode/vscode-api"

export async function activate(context: vscode.ExtensionContext) {
  // Command execution
  context.subscriptions.push(
    vscode.commands.registerCommand("strata-review.reviewBranch", async () => {
      const ext = vscode.extensions.getExtension("stratacode.strata-code")
      const api = ext?.exports as StrataPluginAPI | undefined

      const prompt =
        (api?.getPluginConfigValue?.("strata-review", "prompt") as string) ||
        "Review the current branch changes and provide feedback."

      try {
        if (api?.sendMessage) {
          await api.sendMessage({ text: prompt, focus: true })
          return
        }
        await vscode.commands.executeCommand("strata-code.new.api.sendMessage", prompt, { focus: true })
      } catch (err) {
        vscode.window.showErrorMessage("Failed to communicate with Strata Code. Is the extension installed and active?")
        console.error("Strata Code sendMessage command failed:", err)
      }
    }),
  )

  // UI Contribution
  // Wait for strata code extension to activate so we can register our UI contribution
  const strata = vscode.extensions.getExtension("stratacode.strata-code")
  if (strata) {
    if (!strata.isActive) {
      await strata.activate()
    }
    const api = strata.exports as StrataPluginAPI

    // 1. UI Contribution
    if (api && api.registerUIContribution) {
      const disposable = api.registerUIContribution({
        id: "strata-review.reviewBranchBtn",
        placement: "input-toolbar",
        type: "button",
        label: "Review",
        tooltip: "Review Current Branch",
        icon: "git-compare",
        command: "strata-review.reviewBranch",
      })
      context.subscriptions.push(disposable)
    }

    // 2. Plugin Config Section
    if (api && api.registerConfigSection) {
      const disposable = api.registerConfigSection({
        id: "strata-review",
        title: "Code Review",
        icon: "git-compare",
        fields: [
          {
            key: "prompt",
            type: "string",
            label: "Default Review Prompt",
            description: "The prompt sent to Strata Code when the review button is clicked.",
            default: "Review the current branch changes and provide feedback.",
          },
          {
            key: "autoInjectDiff",
            type: "boolean",
            label: "Auto-inject Git Diff",
            description:
              "Automatically inject the current branch diff as context into prompts sent from the review button.",
            default: true,
          },
        ],
      })
      context.subscriptions.push(disposable)
    }

    // 3. Context Provider
    if (api && api.registerContextProvider) {
      const disposable = api.registerContextProvider({
        id: "strata-review.gitDiff",
        label: "Git Diff",
        provideContext: async (session) => {
          // Check if auto-inject is enabled
          const autoInject = api.getPluginConfigValue("strata-review", "autoInjectDiff") ?? true
          if (!autoInject) return []

          // Note: In a real implementation we would run `git diff` here,
          // but for this example we return mock data.
          return [
            {
              type: "text",
              label: "git diff",
              content: "diff --git a/src/example.ts b/src/example.ts\n+ console.log('hello world');",
            },
          ]
        },
      })
      context.subscriptions.push(disposable)
    }
  }
}

export function deactivate() {}
