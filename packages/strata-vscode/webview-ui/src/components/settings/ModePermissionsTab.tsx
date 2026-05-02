import { Component, Show, For, createMemo, createSignal } from "solid-js"
import { Select } from "@stratacode/strata-ui/select"
import { Card } from "@stratacode/strata-ui/card"
import { Button } from "@stratacode/strata-ui/button"
import { IconButton } from "@stratacode/strata-ui/icon-button"
import type { AgentConfig, PermissionRuleItem, PermissionLevel, PermissionRule, AgentInfo } from "../../types/messages"
import type { TabContext } from "./ModeEditTabs"

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  allow: { bg: "var(--vscode-terminal-ansiGreen, #3fb950)", fg: "var(--vscode-editor-background, #1e1e1e)" },
  ask: { bg: "var(--vscode-editorWarning-foreground, #cca700)", fg: "var(--vscode-editor-background, #1e1e1e)" },
  deny: { bg: "var(--vscode-errorForeground, #f85149)", fg: "var(--vscode-editor-background, #fff)" },
  unknown: { bg: "var(--vscode-descriptionForeground, #8b949e)", fg: "var(--vscode-editor-background, #1e1e1e)" },
}

interface LevelOption {
  value: PermissionLevel
  label: string
}

const LEVEL_OPTIONS: LevelOption[] = [
  { value: "allow", label: "Allow" },
  { value: "ask", label: "Ask" },
  { value: "deny", label: "Deny" },
]

const AGENT_TOOLS = [
  { id: "edit", label: "Edit" },
  { id: "bash", label: "Bash" },
  { id: "read", label: "Read" },
  { id: "external_directory", label: "External Directory" },
  { id: "glob", label: "Glob" },
  { id: "grep", label: "Grep" },
  { id: "list", label: "List" },
  { id: "task", label: "Task" },
  { id: "skill", label: "Skill" },
  { id: "lsp", label: "LSP" },
  { id: "todoread", label: "Todo Read" },
  { id: "todowrite", label: "Todo Write" },
  { id: "websearch", label: "Web Search" },
  { id: "codesearch", label: "Code Search" },
  { id: "webfetch", label: "Web Fetch" },
  { id: "doom_loop", label: "Doom Loop" },
]

function ruleAction(rule: PermissionRule | undefined): PermissionLevel | undefined {
  if (!rule) return undefined
  if (typeof rule === "string") return rule
  return rule["*"] ?? undefined
}

const AgentPermissionEditor: Component<{
  cfg: AgentConfig
  update: (partial: Partial<AgentConfig>) => void
  t: (key: string, params?: Record<string, string>) => string
}> = (props) => {
  const overrides = createMemo(() => {
    const perm = props.cfg.permission || {}
    return AGENT_TOOLS.map((tool) => ({
      ...tool,
      level: ruleAction(perm[tool.id]),
    }))
  })

  const hasAny = createMemo(() => overrides().some((o) => o.level !== undefined))

  const setLevel = (tool: string, level: PermissionLevel | undefined) => {
    if (level === undefined) {
      props.update({ permission: { [tool]: null as any } })
      return
    }
    props.update({ permission: { [tool]: level } })
  }

  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "8px" }}>
        <div>
          <div data-slot="settings-row-label-title">
            {props.t("settings.agentBehaviour.permissions.agentOverridesTitle") || "Agent Permission Overrides"}
          </div>
          <div data-slot="settings-row-label-subtitle">
            {props.t("settings.agentBehaviour.permissions.agentOverridesDesc") ||
              "Override global tool permissions for this agent. Unset values inherit from global settings."}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", "flex-direction": "column" }}>
        <For each={overrides()}>
          {(tool) => (
            <div style={{ display: "flex", gap: "12px", "align-items": "center", "justify-content": "space-between", padding: "6px 0", "border-bottom": "1px solid var(--border-weak-base)" }}>
              <div style={{ flex: 1, "font-size": "13px", color: "var(--text-base, var(--vscode-foreground))" }}>
                {tool.label}
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                <Select
                  options={[
                    { value: undefined as any, label: props.t("common.default") || "Default" },
                    ...LEVEL_OPTIONS,
                  ]}
                  current={
                    tool.level !== undefined
                      ? LEVEL_OPTIONS.find((o) => o.value === tool.level)
                      : { value: undefined as any, label: props.t("common.default") || "Default" }
                  }
                  value={(o) => o.value}
                  label={(o) => o.label}
                  onSelect={(option) => {
                    if (!option || option.value === undefined) {
                      setLevel(tool.id, undefined)
                    } else {
                      setLevel(tool.id, option.value)
                    }
                  }}
                  variant="secondary"
                  size="small"
                  triggerVariant="settings"
                />
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={hasAny()}>
        <div style={{ "margin-top": "8px", display: "flex", "justify-content": "flex-end" }}>
          <Button
            variant="ghost"
            onClick={() => {
              const reset: Record<string, null> = {}
              for (const tool of AGENT_TOOLS) reset[tool.id] = null as any
              props.update({ permission: reset as any })
            }}
          >
            {props.t("settings.agentBehaviour.permissions.resetAll") || "Reset All to Default"}
          </Button>
        </div>
      </Show>
    </Card>
  )
}

const PermissionRuleset: Component<{
  agent: string
  rules: PermissionRuleItem[]
  expanded: boolean
  onToggle: () => void
  t: (key: string, params?: Record<string, string>) => string
}> = (props) => {
  const [copied, setCopied] = createSignal(false)

  const summary = createMemo(() => {
    const tools = new Map<string, PermissionRuleItem["action"]>()
    for (const rule of props.rules) {
      if (rule.pattern === "*") {
        tools.set(rule.permission, rule.action)
      }
    }
    return [...tools.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })

  const copy = (e: MouseEvent) => {
    e.stopPropagation()
    const data = { agent: props.agent, rules: props.rules }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div style={{ display: "flex", "align-items": "center", cursor: "pointer", "user-select": "none" }} onClick={props.onToggle}>
        <IconButton size="small" variant="ghost" icon={props.expanded ? "chevron-down" : "chevron-right"} onClick={(e: MouseEvent) => { e.stopPropagation(); props.onToggle() }} />
        <span data-slot="settings-row-label-title" style={{ "margin-left": "4px" }}>
          {props.t("settings.agentBehaviour.permissions.title")}
        </span>
        <span style={{ "margin-left": "8px", "font-size": "11px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
          {props.t("settings.agentBehaviour.permissions.count", { count: String(props.rules.length) })}
        </span>
        <div style={{ "margin-left": "auto" }}>
          <IconButton size="small" variant="ghost" icon={copied() ? "check" : "copy"} title={props.t("settings.agentBehaviour.permissions.copy")} onClick={copy} />
        </div>
      </div>

      <Show when={props.expanded}>
        <Show when={summary().length > 0}>
          <div style={{ "margin-top": "8px", "margin-bottom": "8px" }}>
            <div style={{ "font-size": "11px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))", "margin-bottom": "4px" }}>
              {props.t("settings.agentBehaviour.permissions.effective")}
            </div>
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "4px" }}>
              <For each={summary()}>
                {([tool, action]) => {
                  const colors = ACTION_COLORS[action] ?? ACTION_COLORS.unknown
                  return (
                    <span style={{ "font-size": "11px", padding: "2px 6px", "border-radius": "3px", background: colors.bg, color: colors.fg, "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                      {tool}: {action}
                    </span>
                  )
                }}
              </For>
            </div>
          </div>
        </Show>

        <div style={{ "margin-top": "8px", "font-size": "11px", "font-family": "var(--vscode-editor-font-family, monospace)", "max-height": "300px", "overflow-y": "auto", border: "1px solid var(--border-weak-base, var(--vscode-panel-border))", "border-radius": "4px" }}>
          <table style={{ width: "100%", "border-collapse": "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-subtle-base, var(--vscode-editorWidget-background))", position: "sticky", top: "0" }}>
                <th style={{ padding: "4px 8px", "text-align": "left", "font-weight": "600" }}>{props.t("settings.agentBehaviour.permissions.col.tool")}</th>
                <th style={{ padding: "4px 8px", "text-align": "left", "font-weight": "600" }}>{props.t("settings.agentBehaviour.permissions.col.pattern")}</th>
                <th style={{ padding: "4px 8px", "text-align": "left", "font-weight": "600" }}>{props.t("settings.agentBehaviour.permissions.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.rules}>
                {(rule, idx) => {
                  const colors = ACTION_COLORS[rule.action] ?? ACTION_COLORS.unknown
                  return (
                    <tr style={{ "border-top": idx() > 0 ? "1px solid var(--border-weak-base, var(--vscode-panel-border))" : "none" }}>
                      <td style={{ padding: "3px 8px" }}>{rule.permission}</td>
                      <td style={{ padding: "3px 8px", color: "var(--text-weak-base)" }}>{rule.pattern}</td>
                      <td style={{ padding: "3px 8px" }}><span style={{ padding: "1px 4px", "border-radius": "2px", background: colors.bg, color: colors.fg }}>{rule.action}</span></td>
                    </tr>
                  )
                }}
              </For>
            </tbody>
          </table>
        </div>

        <div style={{ "margin-top": "6px", "font-size": "10px", color: "var(--text-weak-base, var(--vscode-descriptionForeground))" }}>
          {props.t("settings.agentBehaviour.permissions.hint")}
        </div>
      </Show>
    </Card>
  )
}

export const PermissionsTab: Component<
  TabContext & {
    agentData: () => AgentInfo | undefined
  }
> = (props) => {
  const [expanded, setExpanded] = createSignal(false)

  return (
    <>
      <AgentPermissionEditor cfg={props.cfg()} update={props.update} t={props.t} />
      <Show when={props.agentData()?.permission} keyed>
        {(rules) => (
          <PermissionRuleset
            agent={props.name}
            rules={rules}
            expanded={expanded()}
            onToggle={() => setExpanded((v) => !v)}
            t={props.t}
          />
        )}
      </Show>
    </>
  )
}
