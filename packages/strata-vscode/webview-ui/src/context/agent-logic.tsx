import { createSignal, createMemo, onMount, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { AgentInfo, ExtensionMessage } from "../types/messages"
import { resolveSessionAgent } from "./session-agent"

export interface AgentDependencies {
  vscode: {
    postMessage: (msg: any) => void
    onMessage: (handler: (msg: ExtensionMessage) => void) => () => void
  }
}

export function createAgentLogic(deps: AgentDependencies) {
  const [agents, setAgents] = createSignal<AgentInfo[]>([])
  const [allAgents, setAllAgents] = createSignal<AgentInfo[]>([])

  const defaultAgent = createMemo(() => agents().find((a: any) => a.isDefault)?.name || "code")
  const agentNames = createMemo(() => new Set(agents().map((a) => a.name)))

  const [store, setStore] = createStore({
    agentSelections: {} as Record<string, string>,
  })

  const [pendingAgentSelection, setPendingAgentSelection] = createSignal<string | undefined>()

  const selectedAgentName = createMemo(() => {
    const override = pendingAgentSelection()
    if (override && agents().some((a) => a.name === override)) return override
    return defaultAgent()
  })

  function selectAgent(name: string) {
    if (agents().some((a) => a.name === name)) {
      setPendingAgentSelection(name)
    }
  }

  function getSessionAgent(sessionID: string) {
    return store.agentSelections[sessionID] ?? defaultAgent()
  }

  function setSessionAgent(sessionID: string, name: string) {
    setStore("agentSelections", sessionID, name)
  }

  function handleMessage(message: ExtensionMessage) {
    if (message.type === "agentsLoaded") {
      setAgents(message.agents)
      setAllAgents(message.allAgents ?? message.agents)

      const names = new Set(message.agents.map((a) => a.name))
      const pending = pendingAgentSelection()
      if (pending && !names.has(pending)) {
        setPendingAgentSelection(undefined)
      }
    }
  }

  const unsubAgents = deps.vscode.onMessage(handleMessage)

  onMount(() => {
    if (agents().length === 0) deps.vscode.postMessage({ type: "requestAgents" })
  })

  onCleanup(() => {
    unsubAgents()
  })

  function resolveMessagesAgent(sessionID: string, messages: any[]) {
    if (store.agentSelections[sessionID]) return
    const agent = resolveSessionAgent(messages, agentNames())
    if (agent) setStore("agentSelections", sessionID, agent)
  }

  function handleNewMessageAgent(sessionID: string, agentStr: string | undefined) {
    const agent = agentStr?.trim()
    if (agent && agentNames().has(agent)) {
      setStore("agentSelections", sessionID, agent)
    }
  }

  function removeSession(sessionID: string) {
    setStore(
      "agentSelections",
      produce((selections: any) => {
        delete selections[sessionID]
      })
    )
  }

  function clearAllSessions() {
    setStore("agentSelections", {})
  }

  function setPendingIfMissing(sessionID: string) {
    const pending = pendingAgentSelection()
    if (pending && !store.agentSelections[sessionID]) {
      setStore("agentSelections", sessionID, pending)
    }
  }

  function removeMode(name: string) {
    setAgents((prev) => prev.filter((a) => a.name !== name))
    setAllAgents((prev) => prev.filter((a) => a.name !== name))

    if (pendingAgentSelection() === name) {
      setPendingAgentSelection(undefined)
    }
    setStore(
      "agentSelections",
      produce((selections: any) => {
        for (const sid of Object.keys(selections)) {
          if (selections[sid] === name) delete selections[sid]
        }
      })
    )
    deps.vscode.postMessage({ type: "removeMode", name })
  }

  return {
    agents,
    allAgents,
    defaultAgent,
    agentNames,
    selectedAgentName,
    selectAgent,
    getSessionAgent,
    setSessionAgent,
    resolveMessagesAgent,
    handleNewMessageAgent,
    removeSession,
    clearAllSessions,
    setPendingIfMissing,
    setPendingAgentSelection,
    removeMode,
  }
}
