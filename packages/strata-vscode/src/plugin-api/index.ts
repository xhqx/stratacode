import * as vscode from "vscode"
import type { StrataConnectionService } from "../services/cli-backend"
import type { StrataProvider } from "../StrataProvider"
import type { AgentManagerProvider } from "../agent-manager/AgentManagerProvider"
import type { JSONValue, SessionInfo, StrataPluginAPI, UIContribution, SendOptions } from "@stratacode/vscode-api"
// Match the webview interface locally to avoid rootDir ts errors
export interface RenderableUIContribution {
  id: string
  placement: "input-toolbar" | "toolbar-top" | "message-action"
  type: "button"
  label?: string
  icon?: string
  tooltip?: string
}

export interface RenderablePluginConfigSection {
  id: string
  title: string
  icon?: string
  fields: import("@stratacode/vscode-api").PluginConfigField[]
}

export type Target = {
  provider: StrataProvider
  directory: string
  sessionId?: string
}

// Global registry of UI contributions
export class PluginRegistry {
  private readonly _contributions = new Map<string, UIContribution>()
  private readonly _configSections = new Map<string, import("@stratacode/vscode-api").PluginConfigSection>()
  private readonly _contextProviders = new Map<string, import("@stratacode/vscode-api").ContextProvider>()
  
  private readonly _onDidChangeContributions = new vscode.EventEmitter<RenderableUIContribution[]>()
  public readonly onDidChangeContributions = this._onDidChangeContributions.event

  private readonly _onDidChangeConfigSections = new vscode.EventEmitter<RenderablePluginConfigSection[]>()
  public readonly onDidChangeConfigSections = this._onDidChangeConfigSections.event

  private readonly _onDidChangePluginConfig = new vscode.EventEmitter<{ sectionId: string; key: string; value: JSONValue }>()
  public readonly onDidChangePluginConfig = this._onDidChangePluginConfig.event

  private configDisposables = new Map<string, vscode.Disposable>()

  private readonly _onWillSendMessage = new vscode.EventEmitter<import("@stratacode/vscode-api").WillSendMessageEvent>()
  public readonly onWillSendMessage = this._onWillSendMessage

  private readonly _onDidCompleteMessage = new vscode.EventEmitter<import("@stratacode/vscode-api").DidCompleteMessageEvent>()
  public readonly onDidCompleteMessage = this._onDidCompleteMessage

  registerUIContribution(contribution: UIContribution): vscode.Disposable {
    if (this._contributions.has(contribution.id)) {
      console.warn(`[StrataPluginAPI] Overwriting existing UI contribution: ${contribution.id}`)
    }
    this._contributions.set(contribution.id, contribution)
    this.broadcast()

    return new vscode.Disposable(() => {
      this._contributions.delete(contribution.id)
      this.broadcast()
    })
  }

  registerConfigSection(section: import("@stratacode/vscode-api").PluginConfigSection): vscode.Disposable {
    if (this._configSections.has(section.id)) {
      console.warn(`[StrataPluginAPI] Ignoring duplicate config section registration: ${section.id}`)
      return new vscode.Disposable(() => {})
    }

    // Validate schema
    if (section.fields.some(f => !f.key)) {
      console.error(`[StrataPluginAPI] Invalid config section ${section.id}: fields must have keys.`)
      return new vscode.Disposable(() => {})
    }

    this._configSections.set(section.id, section)
    
    // Wire up vs code setting change listener
    const disp = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(section.id)) {
        const config = vscode.workspace.getConfiguration(section.id)
        for (const field of section.fields) {
          const val = config.get(field.key)
          this._onDidChangePluginConfig.fire({ sectionId: section.id, key: field.key, value: val as JSONValue })
        }
      }
    })
    this.configDisposables.set(section.id, disp)

    this.broadcastConfigSections()

    return new vscode.Disposable(() => {
      this._configSections.delete(section.id)
      this.configDisposables.get(section.id)?.dispose()
      this.configDisposables.delete(section.id)
      this.broadcastConfigSections()
    })
  }

  registerContextProvider(provider: import("@stratacode/vscode-api").ContextProvider): vscode.Disposable {
    if (this._contextProviders.has(provider.id)) {
      console.warn(`[StrataPluginAPI] Ignoring duplicate context provider registration: ${provider.id}`)
      return new vscode.Disposable(() => {})
    }
    this._contextProviders.set(provider.id, provider)
    return new vscode.Disposable(() => {
      this._contextProviders.delete(provider.id)
    })
  }

  getRenderableContributions(): RenderableUIContribution[] {
    return Array.from(this._contributions.values()).map(c => ({
      id: c.id,
      placement: c.placement,
      type: c.type,
      label: c.label,
      icon: c.icon,
      tooltip: c.tooltip
    }))
  }

  getRenderableConfigSections(): RenderablePluginConfigSection[] {
    return Array.from(this._configSections.values()).map(s => ({
      id: s.id,
      title: s.title,
      icon: s.icon,
      fields: s.fields
    }))
  }

  getPluginConfigValue(sectionId: string, key: string): JSONValue | undefined {
    return vscode.workspace.getConfiguration(sectionId).get(key)
  }

  async getContextItems(session: SessionInfo): Promise<import("@stratacode/vscode-api").ContextItem[]> {
    const providers = Array.from(this._contextProviders.values())
    if (providers.length === 0) return []

    const empty: PromiseSettledResult<import("@stratacode/vscode-api").ContextItem[]>[] = []
    const timeout = new Promise<typeof empty>(resolve =>
      setTimeout(() => {
        console.warn("[StrataPluginAPI] Context providers timed out.")
        resolve(empty)
      }, 3000)
    )

    const results = await Promise.race([
      Promise.allSettled(providers.map(p => p.provideContext(session))),
      timeout
    ])

    return results
      .filter((r): r is PromiseFulfilledResult<import("@stratacode/vscode-api").ContextItem[]> => r.status === "fulfilled")
      .flatMap(r => r.value)
      .filter(item => item.content.length <= 4096)
      .slice(0, 10)
  }

  executeContribution(id: string) {
    const contribution = this._contributions.get(id)
    if (!contribution) {
      console.warn(`[StrataPluginAPI] Attempted to execute unknown UI contribution: ${id}`)
      return
    }
    vscode.commands.executeCommand(contribution.command, ...(contribution.commandArgs || []))
  }

  private broadcast() {
    this._onDidChangeContributions.fire(this.getRenderableContributions())
  }

  private broadcastConfigSections() {
    this._onDidChangeConfigSections.fire(this.getRenderableConfigSections())
  }
}

export const pluginRegistry = new PluginRegistry()

export function createPluginAPI(deps: {
  connection: StrataConnectionService
  sidebar: StrataProvider
  tabs: Map<vscode.WebviewPanel, StrataProvider>
  agent: AgentManagerProvider | undefined
  version: string
}): StrataPluginAPI {
  const onDidCreateSessionEmitter = new vscode.EventEmitter<SessionInfo>()
  const onDidChangeActiveSessionEmitter = new vscode.EventEmitter<SessionInfo | undefined>()

  let lastActiveSessionId: string | undefined

  function checkActiveSession() {
    const active = target()
    if (active.sessionId !== lastActiveSessionId) {
      lastActiveSessionId = active.sessionId
      onDidChangeActiveSessionEmitter.fire(active.sessionId ? {
        id: active.sessionId,
        title: "Session", // We don't have the title easily accessible here without querying StrataProvider state
        directory: active.directory
      } as SessionInfo : undefined)
    }
  }

  // Hook into active text editor changes or panel focus changes to update active session
  vscode.window.onDidChangeActiveTextEditor(() => checkActiveSession())
  vscode.window.onDidChangeWindowState(() => checkActiveSession())

  deps.sidebar.onDidRegisterSession((session) => {
    onDidCreateSessionEmitter.fire({
      id: session.id,
      title: session.title,
      directory: deps.sidebar.getWorkspaceDirectoryPublic(session.id)
    })
    checkActiveSession()
  })

  for (const p of deps.tabs.values()) {
    p.onDidRegisterSession((session) => {
      onDidCreateSessionEmitter.fire({
        id: session.id,
        title: session.title,
        directory: p.getWorkspaceDirectoryPublic(session.id)
      })
      checkActiveSession()
    })
  }

  // Resolve the best target provider
  function target(): Target {
    // 1. Active tab panel
    for (const [panel, p] of deps.tabs) {
      if (panel.active) {
        return {
          provider: p,
          directory: p.getWorkspaceDirectoryPublic(p.getCurrentSessionId()),
          sessionId: p.getCurrentSessionId(),
        }
      }
    }
    
    // 2. Sidebar
    return {
      provider: deps.sidebar,
      directory: deps.sidebar.getWorkspaceDirectoryPublic(deps.sidebar.getCurrentSessionId()),
      sessionId: deps.sidebar.getCurrentSessionId(),
    }
  }

  return {
    version: deps.version,

    async sendMessage(options: SendOptions) {
      const client = await deps.connection.getClientAsync()
      const t = target()

      if (options?.focus !== false) {
        await vscode.commands.executeCommand("strata-code.SidebarProvider.focus")
        await t.provider.waitForReady()
      }

      const sid = options?.sessionId ?? t.sessionId
      const dir = t.provider.getWorkspaceDirectoryPublic(sid)

      let sessionId = sid
      if (!sessionId) {
        const { data } = await client.session.create(
          { directory: dir },
          { throwOnError: true }
        )
        sessionId = data.id
        t.provider.registerSession(data)
      }

      await t.provider.handleSendMessage(
        options.text,
        undefined,
        sessionId,
        undefined,
        undefined,
        undefined,
        options.agent
      )
    },

    async getActiveSession() {
      const t = target()
      const id = t.sessionId
      if (!id) return undefined
      return { id, title: "Active Session", directory: t.directory }
    },

    async focus() {
      await vscode.commands.executeCommand("strata-code.SidebarProvider.focus")
    },

    registerUIContribution(contribution: UIContribution) {
      return pluginRegistry.registerUIContribution(contribution)
    },

    registerConfigSection(section: import("@stratacode/vscode-api").PluginConfigSection) {
      return pluginRegistry.registerConfigSection(section)
    },

    getPluginConfigValue(sectionId: string, key: string) {
      return pluginRegistry.getPluginConfigValue(sectionId, key)
    },

    registerContextProvider(provider: import("@stratacode/vscode-api").ContextProvider) {
      return pluginRegistry.registerContextProvider(provider)
    },

    onDidChangePluginConfig: pluginRegistry.onDidChangePluginConfig,
    onWillSendMessage: pluginRegistry.onWillSendMessage.event,
    onDidCompleteMessage: pluginRegistry.onDidCompleteMessage.event,

    onDidCreateSession: onDidCreateSessionEmitter.event,
    onDidChangeActiveSession: onDidChangeActiveSessionEmitter.event
  }
}
