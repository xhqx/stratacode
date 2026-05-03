import { Component, createEffect, onMount } from "solid-js"
import { useServer } from "../../context/server"
import { useConfig } from "../../context/config"
import { Button } from "@stratacode/strata-ui/button"

const ProjectMemoryTab: Component = () => {
  const { repoMapStats, requestRepoMapStats, invalidateRepoMap } = useServer()
  const { config, updateConfig } = useConfig()

  onMount(() => {
    requestRepoMapStats()
  })

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
          Repository Map Engine
        </div>
        <div style={{ "font-size": "12px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
          The repository map is an automatically generated, token-budgeted skeleton of your codebase. It provides the AI
          agent with structural awareness of your project.
        </div>
      </div>

      <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))" }}>
            Character Budget
          </div>
          <div
            style={{
              "font-size": "12px",
              color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              "margin-top": "4px",
            }}
          >
            Maximum allowed characters for the generated map. Set to 0 to disable the map engine.
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
          value={config().repomap?.budget ?? 4096}
          min="0"
          step="1024"
          onChange={(e) => updateConfig({ repomap: { budget: Number(e.currentTarget.value) } })}
        />
      </div>

      <div
        style={{
          background: "var(--surface-strong-base, var(--vscode-editor-background))",
          border: "1px solid var(--border-weak-base, var(--vscode-widget-border))",
          padding: "16px",
          "border-radius": "4px",
        }}
      >
        <div
          style={{
            "font-size": "13px",
            color: "var(--text-base, var(--vscode-foreground))",
            "margin-bottom": "12px",
            "font-weight": "600",
          }}
        >
          Current Map Statistics
        </div>

        {repoMapStats() ? (
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "8px",
              "font-size": "13px",
              color: "var(--text-base, var(--vscode-foreground))",
            }}
          >
            <div style={{ display: "flex", "justify-content": "space-between" }}>
              <span>Files Indexed:</span>
              <span>{repoMapStats()!.files.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", "justify-content": "space-between" }}>
              <span>Symbols Extracted:</span>
              <span>{repoMapStats()!.symbols.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", "justify-content": "space-between" }}>
              <span>Total Characters:</span>
              <span
                style={{
                  color:
                    repoMapStats()!.chars > (config().repomap?.budget ?? 4096)
                      ? "var(--text-error-base, var(--vscode-errorForeground))"
                      : "inherit",
                }}
              >
                {repoMapStats()!.chars.toLocaleString()} / {(config().repomap?.budget ?? 4096).toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ "font-size": "13px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
            Loading statistics...
          </div>
        )}
      </div>

      <div>
        <div
          style={{ "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))", "margin-bottom": "8px" }}
        >
          Cache Management
        </div>
        <div
          style={{
            "font-size": "12px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
            "margin-bottom": "12px",
          }}
        >
          Force the repository map to re-index. This is useful if the codebase structure has changed significantly
          outside of VS Code.
        </div>
        <Button onClick={invalidateRepoMap} variant="secondary">
          Reset Cache
        </Button>
      </div>

      <div
        style={{ "border-top": "1px solid var(--border-weak-base, var(--vscode-widget-border))", margin: "8px 0" }}
      />

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
