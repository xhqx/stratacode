// stratacode_change - new file
import { For } from "solid-js"

interface Props {
  type: "sidebar" | "page"
}

export function DocSkeleton(props: Props) {
  if (props.type === "sidebar") {
    return (
      <div style={{ display: "flex", "flex-direction": "column", gap: "8px", padding: "8px" }}>
        <For each={[1, 2, 3, 4, 5]}>
          {() => (
            <div
              style={{
                height: "32px",
                "border-radius": "4px",
                "background-color": "var(--vscode-editor-inactiveSelectionBackground)",
                opacity: 0.5,
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
          )}
        </For>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.2; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: "16px", display: "flex", "flex-direction": "column", gap: "16px" }}>
      <div
        style={{
          height: "40px",
          width: "60%",
          "border-radius": "4px",
          "background-color": "var(--vscode-editor-inactiveSelectionBackground)",
          opacity: 0.5,
          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        }}
      />
      <For each={[1, 2, 3]}>
        {() => (
          <div
            style={{
              height: "16px",
              width: "100%",
              "border-radius": "2px",
              "background-color": "var(--vscode-editor-inactiveSelectionBackground)",
              opacity: 0.5,
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        )}
      </For>
      <div
        style={{
          height: "16px",
          width: "80%",
          "border-radius": "2px",
          "background-color": "var(--vscode-editor-inactiveSelectionBackground)",
          opacity: 0.5,
          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        }}
      />
    </div>
  )
}
