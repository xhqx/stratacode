with open('webview-ui/src/context/permission-logic.tsx', 'r') as f:
    content = f.read()

content = content.replace("  vscode: {", "  showToast: (props: any) => void;\n  language: any;\n  vscode: {")
content = content.replace(
"""    } else if (message.type === "permissionError") {
      // Keep it in the list so the user can try again
      setRespondingPermissions((prev) => {
        const next = new Set(prev)
        next.delete(message.permissionID)
        return next
      })
    }""",
"""    } else if (message.type === "permissionError") {
      // Keep it in the list so the user can try again
      setRespondingPermissions((prev) => {
        const next = new Set(prev)
        next.delete(message.permissionID)
        return next
      })
      deps.showToast({
        variant: "error",
        title: deps.language.t("settings.permissions.toast.updateFailed.title"),
      })
    }"""
)

with open('webview-ui/src/context/permission-logic.tsx', 'w') as f:
    f.write(content)

