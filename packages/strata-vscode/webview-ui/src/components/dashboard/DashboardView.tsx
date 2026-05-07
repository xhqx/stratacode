import { Component, createMemo, For, Show, onMount } from "solid-js"
import { useServer } from "../../context/server"
import { useProvider } from "../../context/provider"
import { useSession } from "../../context/session"
import { useConfig } from "../../context/config"
import { useWorker } from "../../context/worker"
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

/* eslint-disable complexity */
export const DashboardView: Component<DashboardViewProps> = (props) => {
  const server = useServer()
  const providerCtx = useProvider()
  const session = useSession()
  const config = useConfig()
  const worker = useWorker()
  const scenario = useScenario()
  const indexing = useIndexing()

  const providers = createMemo(() => Object.values(providerCtx.providers()))
  const models = createMemo(() => providerCtx.models())
  const auth = createMemo(() => Object.values(providerCtx.authStates()))

  const mcp = createMemo(() => Object.values(session.mcpStatus()))
  const mcpCount = (status: string) => mcp().filter((item) => item.status === status).length

  const acp = createMemo(() => Object.values(config.acpProviders()))
  const acpEnabled = createMemo(() => acp().filter((p) => p.enabled).length)
  const acpInstalled = createMemo(() => acp().filter((p) => p.installed).length)
  const acpModels = createMemo(() => acp().reduce((sum, p) => sum + (p.staticModels?.length || 0) + (p.liveModels?.length || 0), 0))

  const visibleAgents = createMemo(() => session.agents())
  const allAgents = createMemo(() => session.allAgents())
  const nativeAgents = createMemo(() => allAgents().filter((agent) => agent.native).length)
  const customAgents = createMemo(() => allAgents().filter((agent) => !agent.native).length)

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
          <Row label="Workspace" value={server.workspaceDirectory() ? server.workspaceDirectory().split("/").pop() : "Not set"} />
          <Row label="Git" value={server.gitInstalled() ? "Available" : "Unavailable"} />
          <Row label="Auth" value={server.profileData() ? "Signed in" : "Signed out"} />
        </WidgetCard>

        {/* 2. Model Providers Widget */}
        <WidgetCard
          title="Model Providers"
          icon="server"
          summary={`${providerCtx.connected().length}/${Object.keys(providerCtx.providers()).length} Connected`}
        >
          <Row label="Active Provider" value={providerCtx.defaultSelection().providerID || "None"} />
          <Row label="Active Model" value={providerCtx.defaultSelection().modelID || "None"} />
          <Row label="Total Providers" value={`${providers().length}`} />
          <Row label="Total Models" value={`${models().length}`} />
          <Row label="Auth Methods" value={`${Object.keys(providerCtx.authMethods()).length}`} />
          <Row label="Favorites" value={`${session.favoriteModels().length}`} />
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
            <Row label="Total" value={`${mcp().length}`} />
            <Row label="Connected" value={`${mcpCount("connected")}`} />
            <Row label="Needs Auth" value={`${mcpCount("needs_auth") + mcpCount("needs_client_registration")}`} />
            <Row label="Failed">
              <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                {mcpCount("failed") > 0 ? <StatusDot status="failed" /> : null}
                <span>{mcpCount("failed")}</span>
              </div>
            </Row>
            <div style={{ margin: "4px 0", "border-top": "1px solid var(--vscode-widget-border, transparent)" }} />
            <For each={Object.entries(session.mcpStatus())}>
              {([name, stat]) => (
                <div style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
                  <Row label={name}>
                    <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                      <StatusDot status={stat.status === "connected" ? "connected" : stat.status === "disabled" ? "disabled" : "failed"} />
                      <span style={{ "text-transform": "capitalize" }}>{stat.status.replace("_", " ")}</span>
                    </div>
                  </Row>
                  <Show when={stat.error}>
                    <div style={{ "font-size": "10px", color: "var(--vscode-errorForeground)", "margin-left": "8px", "white-space": "normal" }}>
                      {stat.error}
                    </div>
                  </Show>
                </div>
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
            <Row label="Installed" value={`${acpInstalled()}/${acp().length}`} />
            <Row label="Enabled" value={`${acpEnabled()}/${acp().length}`} />
            <Row label="Models" value={`${acpModels()}`} />
            <Row label="Missing Env" value={`${acp().filter((p) => p.env.length > 0 && !p.installed).length}`} />
            <div style={{ margin: "4px 0", "border-top": "1px solid var(--vscode-widget-border, transparent)" }} />
            <For each={Object.values(config.acpProviders())}>
              {(p) => (
                <Row label={p.name}>
                  <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                    {p.installed ? (
                      <span style={{ "font-size": "10px", "background-color": "var(--vscode-badge-background)", color: "var(--vscode-badge-foreground)", padding: "1px 4px", "border-radius": "3px" }}>Installed</span>
                    ) : null}
                    <Show when={p.configuredModel || p.defaultModel}>
                      <span style={{ "font-size": "10px", color: "var(--vscode-descriptionForeground)" }}>{p.configuredModel || p.defaultModel}</span>
                    </Show>
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
          <Row label="Current Status" value={session.status()} />
          <Row label="Total" value={`${allAgents().length}`} />
          <Row label="Visible" value={`${visibleAgents().length}`} />
          <Row label="Native" value={`${nativeAgents()}`} />
          <Row label="Custom" value={`${customAgents()}`} />
        </WidgetCard>

        {/* 6. Scenarios Widget */}
        <WidgetCard
          title="Scenarios"
          icon="play"
          summary={`${scenario.configuredScenarios().length} Configured`}
        >
          <Row label="Configured" value={`${scenario.configuredScenarios().length}`} />
          <Show
            when={scenario.activeScenario()}
            fallback={<Row label="Status" value="Idle" />}
          >
            {(active) => (
              <>
                <Row label="Active Scenario" value={active().length > 0 ? "Running" : "Idle"} />
                <Row label="Active Steps" value={`${active().length}`} />
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
                <Row label="Files" value={stats().files.toLocaleString()} />
                <Row label="Symbols" value={stats().symbols.toLocaleString()} />
                <Row label="Characters" value={`${(stats().chars / 1000).toFixed(1)}k`} />
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
              <>
                <Row label="Tokens Used" value={usage().tokens.toLocaleString()} />
                <Show when={usage().percentage !== null}>
                  <ProgressBar
                    current={usage().percentage!}
                    max={100}
                    label={`Usage: ${Math.round(usage().percentage!)}%`}
                    warn={75}
                    danger={90}
                  />
                </Show>
              </>
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
            <Row label="Percent" value={`${Math.round(indexing.status().percent)}%`} />
            <Row label="State" value={indexing.label()} />
            <ProgressBar
              current={indexing.status().percent}
              max={100}
              label={`${indexing.status().processedFiles} / ${indexing.status().totalFiles} files`}
              danger={indexing.tone() === "error" ? 0 : undefined}
            />
          </Show>
        </WidgetCard>

        {/* 10. Auto-Approve Widget */}
        <WidgetCard
          title="Auto-Approve"
          icon="shield"
          summary={Object.keys(session.timers()).length > 0 ? `${Object.keys(session.timers()).length} Timers` : "Idle"}
        >
          <Row label="Active Timers" value={`${Object.keys(session.timers()).length}`} />
          <Row label="Pending Permissions" value={`${session.permissions().length}`} />
          <Show when={Object.keys(session.timers()).length > 0}>
            <Row label="Shortest Timer" value={`${Math.min(...Object.values(session.timers()))}s`} />
          </Show>
        </WidgetCard>

        {/* 11. Changes Widget */}
        <WidgetCard
          title="Changes"
          icon="review"
          summary={session.worktreeStats() ? `${session.worktreeStats()!.files} Files` : "No changes"}
        >
          <Show
            when={session.worktreeStats()}
            fallback={<div style={{ "font-size": "12px", color: "var(--vscode-descriptionForeground)" }}>No active worktree changes.</div>}
          >
            {(stats) => (
              <>
                <Row label="Files Changed" value={`${stats().files}`} />
                <Row label="Additions" value={`+${stats().additions}`} />
                <Row label="Deletions" value={`-${stats().deletions}`} />
              </>
            )}
          </Show>
        </WidgetCard>

        {/* 12. Workers Widget */}
        <WidgetCard
          title="Workers"
          icon="circuit-board"
          summary={`${worker.status().activeWorkers} Active`}
        >
          <Row label="Active Workers" value={`${worker.status().activeWorkers}`} />
          <Row label="Recent Tasks" value={`${worker.status().lastTasks.length}`} />
          <Show when={worker.status().lastTasks.length > 0}>
            <div style={{ "margin-top": "8px", "border-top": "1px solid var(--vscode-widget-border)", "padding-top": "8px" }}>
              <div style={{ color: "var(--vscode-descriptionForeground)", "font-size": "11px", "margin-bottom": "4px" }}>Latest Task</div>
              <div style={{ "font-size": "12px", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                {worker.status().lastTasks[worker.status().lastTasks.length - 1].worker} - {worker.status().lastTasks[worker.status().lastTasks.length - 1].status}
              </div>
            </div>
          </Show>
        </WidgetCard>

        {/* 13. Remote Control Widget */}
        <WidgetCard
          title="Remote Control"
          icon="link"
          summary={server.remoteStatus()?.enabled ? (server.remoteStatus()?.connected ? "Connected" : "Disconnected") : "Disabled"}
        >
          <Row label="Enabled" value={server.remoteStatus()?.enabled ? "Yes" : "No"} />
          <Row label="Status" value={server.remoteStatus()?.connected ? "Connected" : "Disconnected"} />
        </WidgetCard>
      </div>
    </div>
  )
}
