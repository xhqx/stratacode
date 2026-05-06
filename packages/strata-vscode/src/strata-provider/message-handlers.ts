import type { FeatureContext } from "../stratacode/feature"
import type { PlanningService } from "../planning"
import type { ForkContext } from "./fork-session"
import type { MessageFile } from "./message-files"

export interface ProviderContext extends FeatureContext {
  currentSession: string | null | undefined
  projectDirectory: string | null | undefined
  getWorkspaceDirectory: () => string
  getProjectDirectory: (sessionId?: string) => string | undefined
  postMessage: (msg: Record<string, unknown>) => void
  showErrorMessage: (msg: string) => void
  executePluginContribution: (id: string) => void
  openExternal: (url: string) => void
  disposeGlobal: () => Promise<void>
  fetchAndSendProviders: () => Promise<void>
  fetchAndSendAgents: () => Promise<void>
  isEnabled: (feature: string) => boolean
  getPlanningService: () => PlanningService | null
  getCachedConfigMessage?: () => unknown
  setCachedConfigMessage?: (msg: unknown) => void

  // Session Management
  handleSendMessage: (text: string, messageID?: string, sessionID?: string, draftID?: string, providerID?: string, modelID?: string, agent?: string, variant?: string, files?: MessageFile[]) => Promise<void>
  handleSendCommand: (command: string, args: any, messageID?: string, sessionID?: string, draftID?: string, providerID?: string, modelID?: string, agent?: string, variant?: string, files?: MessageFile[]) => Promise<void>
  cancelRetry: (sessionID: string) => void
  handleAbort: (sessionID?: string) => Promise<void>
  handleRevertSession: (sessionID: string, messageID: string) => Promise<void>
  handleUnrevertSession: (sessionID: string) => Promise<void>
  handleCreateSession: () => Promise<void>
  clearCurrentSession: () => void
  handleLoadMessages: (sessionID: string, opts?: { mode?: any; before?: string; limit?: number }) => Promise<void>
  handleSyncSession: (sessionID: string, parentSessionID?: string) => Promise<void>
  handleLoadSessions: () => Promise<void>
  handleCompact: (sessionID: string, providerID?: string, modelID?: string) => Promise<void>
  getForkCtx: () => ForkContext

  // Additional methods will be added as needed by specific handlers
}

export interface MessageHandler {
  readonly types: readonly string[]
  handle(msg: Record<string, unknown>, ctx: ProviderContext): Promise<boolean>
}
