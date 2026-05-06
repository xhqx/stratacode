import { Component } from "solid-js"
import { useConfig } from "../../context/config"

const ProjectMemoryTab: Component = () => {
  const { config, updateConfig } = useConfig()

  return (
    <div
      data-component="project-memory-settings"
      style={{ padding: "16px 0", display: "flex", "flex-direction": "column", gap: "24px" }}
    >
      <div>
        <div
          style={{
            "font-size": "13px",
            color: "var(--text-base, var(--vscode-foreground))",
            "margin-bottom": "8px",
            "font-weight": "600",
          }}
        >
          Semantic Project Memory
        </div>
        <div
          style={{
            "font-size": "12px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
            "margin-bottom": "16px",
          }}
        >
          Automatically extract architectural decisions, rules, and context into memory files
          (`.stratacode/memory/*.md`) when you pull new commits or change branches.
        </div>

        <div style={{ display: "flex", "align-items": "center", gap: "12px", "margin-bottom": "16px" }}>
          <input
            type="checkbox"
            id="semantic-memory-enabled"
            checked={config().project_memory?.enabled ?? false}
            onChange={(e) =>
              updateConfig({
                project_memory: {
                  ...config().project_memory,
                  enabled: e.currentTarget.checked,
                },
              })
            }
          />
          <label
            for="semantic-memory-enabled"
            style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", cursor: "pointer" }}
          >
            Enable Auto-Extraction on Git Pull
          </label>
        </div>

        <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))" }}>
              Commit Window
            </div>
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                "margin-top": "4px",
              }}
            >
              Maximum number of recent commits to analyze per pull/branch change.
            </div>
          </div>
          <input
            type="number"
            style={{
              width: "100px",
              padding: "4px 8px",
              "background-color": "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-input-border)",
              "border-radius": "2px",
            }}
            value={config().project_memory?.max_commits ?? 10}
            min="1"
            step="1"
            onChange={(e) =>
              updateConfig({
                project_memory: { ...config().project_memory, max_commits: Number(e.currentTarget.value) },
              })
            }
          />
        </div>
      </div>
    </div>
  )
}

export default ProjectMemoryTab
