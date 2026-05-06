import { Component, createMemo, For, Show, onMount } from "solid-js"
import { useServer } from "../../context/server"
import { useProvider } from "../../context/provider"
import { useSession } from "../../context/session"
import { useConfig } from "../../context/config"
import { useScenario } from "../../context/stratacode/scenario"
import { useIndexing } from "../../context/indexing"
import { WidgetCard } from "./WidgetCard"
import { StatusDot } from "./StatusDot"
import { ProgressBar } from "./ProgressBar"

export interface DashboardViewProps {
  onBack: () => void
}

const Row: Component<{ label: string; value?: string; children?: any }> = (props) => (
  <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "font-size": "12px" }}>
    <span style={{ color: "var(--vscode-descriptionForeground)" }}>{props.label}</span>
    {props.value !== undefined ? <span>{props.value}</span> : props.children}
  </div>
)

export const DashboardView: Component<DashboardViewProps> = (props) => {
  const server = useServer()
  const providerCtx = useProvider()
  const session = useSession()
  const config = useConfig()
  const scenario = useScenario()
  const indexing = useIndexing()

  onMount(() => {
    server.requestRepoMapStats()
    session.refreshMcpStatus()
  })

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "background-color": "var(--vscode-sideBar-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          padding: "10px 14px",
          "border-bottom": "1px solid var(--vscode-sideBarSectionHeader-border, transparent)",
          "background-color": "var(--vscode-sideBarSectionHeader-background)",
          "font-weight": 600,
          "font-size": "11px",
          "text-transform": "uppercase",
        }}
      >
        System Dashboard
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px",
          display: "flex",
          "flex-direction": "column",
          gap: "12px",
        }}
      >
        {/* 1. Connection Widget */}
        <WidgetCard
          title="Connection"
          icon="status"
          summary={server.connectionState()}
        >
          <Row label="Status">
            <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
              <StatusDot status={server.connectionState() === "connected" ? "connected" : "failed"} />
              <span style={{ "text-transform": "capitalize" }}>{server.connectionState()}</span>
            </div>
          </Row>
          <Show when={server.serverInfo()?.version}>
            <Row label="Server Version" value={server.serverInfo()?.version} />
          </Show>
          <Show when={server.extensionVersion()}>
            <Row label="Extension Version" value={server.extensionVersion()} />
          </Show>
        </WidgetCard>

        {/* 2. Model Providers Widget */}
        <WidgetCard
          title="Model Providers"
          icon="server"
          summary={`${providerCtx.connected().length}/${Object.keys(providerCtx.providers()).length} Connected`}
        >
          <Row label="Active Provider" value={providerCtx.defaultSelection().providerID || "None"} />
          <Row label="Active Model" value={providerCtx.defaultSelection().modelID || "None"} />
        </WidgetCard>

        {/* 3. MCP Servers Widget */}
        <WidgetCard
          title="MCP Servers"
          icon="mcp"
          summary={`${Object.values(session.mcpStatus()).filter(s => s.status === "connected").length} Connected`}
        >
          <Show
            when={Object.keys(session.mcpStatus()).length > 0}
            fallback={<div style={{ "font-size": "12px", color: "var(--vscode-descriptionForeground)" }}>No MCP servers configured.</div>}
          >
            <For each={Object.entries(session.mcpStatus())}>
              {([name, stat]) => (
                <Row label={name}>
                  <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                    <StatusDot status={stat.status === "connected" ? "connected" : stat.status === "disabled" ? "disabled" : "failed"} />
                    <span style={{ "text-transform": "capitalize" }}>{stat.status.replace("_", " ")}</span>
                  </div>
                </Row>
              )}
            </For>
          </Show>
        </WidgetCard>

        {/* 4. ACP Providers Widget */}
        <WidgetCard
          title="ACP Providers"
          icon="providers"
          summary={`${Object.values(config.acpProviders()).filter(p => p.status === "connected").length} Connected`}
        >
          <Show
            when={Object.keys(config.acpProviders()).length > 0}
            fallback={<div style={{ "font-size": "12px", color: "var(--vscode-descriptionForeground)" }}>No ACP providers configured.</div>}
          >
            <For each={Object.values(config.acpProviders())}>
              {(p) => (
                <Row label={p.name}>
                  <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                    {p.installed ? (
                      <span style={{ "font-size": "10px", "background-color": "var(--vscode-badge-background)", color: "var(--vscode-badge-foreground)", padding: "1px 4px", "border-radius": "3px" }}>Installed</span>
                    ) : null}
                    <StatusDot status={p.enabled ? (p.status === "connected" ? "connected" : p.status === "connecting" ? "pending" : "failed") : "disabled"} />
                  </div>
                </Row>
              )}
            </For>
          </Show>
        </WidgetCard>

        {/* 5. Agents Widget */}
        <WidgetCard
          title="Agents"
          icon="organization"
          summary={`${session.agents().length} Visible`}
        >
          <Row label="Active Agent" value={session.selectedAgent()} />
          <Row label="Status" value={session.status()} />
        </WidgetCard>

        {/* 6. Scenarios Widget */}
        <WidgetCard
          title="Scenarios"
          icon="play"
          summary={`${scenario.configuredScenarios().length} Configured`}
        >
          <Show
            when={scenario.activeScenario()}
            fallback={<Row label="Status" value="Idle" />}
          >
            {(active) => (
              <>
                <Row label="Active Scenario" value={active().length > 0 ? "Running" : "Idle"} />
                <ProgressBar
                  current={scenario.scenarioIndex() + 1}
                  max={active().length}
                  label={`Step ${scenario.scenarioIndex() + 1} of ${active().length}`}
                />
              </>
            )}
          </Show>
        </WidgetCard>

        {/* 7. Repo Map Widget */}
        <WidgetCard
          title="Repo Map"
          icon="branch"
          summary={server.repoMapStats() ? `${server.repoMapStats()!.files} Files` : "Idle"}
        >
          <Show
            when={server.repoMapStats()}
            fallback={<div style={{ "font-size": "12px", color: "var(--vscode-descriptionForeground)" }}>Repo map data not available.</div>}
          >
            {(stats) => (
              <>
                <Row label="Symbols" value={stats().symbols.toLocaleString()} />
                <ProgressBar
                  current={stats().chars}
                  max={stats().budget}
                  label={`Budget Used: ${(stats().chars / 1000).toFixed(1)}k / ${(stats().budget / 1000).toFixed(1)}k`}
                  warn={75}
                  danger={90}
                />
              </>
            )}
          </Show>
        </WidgetCard>

        {/* 8. Context Window Widget */}
        <WidgetCard
          title="Context Window"
          icon="server"
          summary={session.contextUsage() ? `${(session.contextUsage()!.tokens / 1000).toFixed(1)}k Tokens` : "Idle"}
        >
          <Show
            when={session.contextUsage()}
            fallback={<div style={{ "font-size": "12px", color: "var(--vscode-descriptionForeground)" }}>No active context usage.</div>}
          >
            {(usage) => (
              <Show
                when={usage().percentage !== null}
                fallback={<Row label="Tokens Used" value={usage().tokens.toLocaleString()} />}
              >
                <ProgressBar
                  current={usage().percentage!}
                  max={100}
                  label={`Usage: ${Math.round(usage().percentage!)}%`}
                  warn={75}
                  danger={90}
                />
              </Show>
            )}
          </Show>
        </WidgetCard>

        {/* 9. Semantic Indexing Widget */}
        <WidgetCard
          title="Semantic Indexing"
          icon="magnifying-glass"
          summary={indexing.label()}
        >
          <Show
            when={config.features().indexing}
            fallback={<Row label="Status" value="Disabled" />}
          >
            <ProgressBar
              current={indexing.status().percent}
              max={100}
              label={`${indexing.status().processedFiles} / ${indexing.status().totalFiles} files`}
              danger={indexing.tone() === "error" ? 0 : undefined}
            />
          </Show>
        </WidgetCard>

        {/* 10. Workers Widget (Settings Summary) */}
        <WidgetCard
          title="Workers"
          icon="circuit-board"
          summary={config.extensionFeatures().workers ? "Enabled" : "Disabled"}
        >
          <div style={{ "font-size": "11px", color: "var(--vscode-descriptionForeground)", "margin-bottom": "8px", "line-height": "1.4" }}>
            Settings summary only. No live worker runtime status available.
          </div>
          <Row label="Summarizer" value={config.extensionFeatures().workers ? "Active" : "Inactive"} />
        </WidgetCard>
      </div>
    </div>
  )
}
