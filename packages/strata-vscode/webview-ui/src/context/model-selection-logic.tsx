import { createMemo, createSignal, onMount, createEffect } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { Accessor } from "solid-js"
import type { ModelSelection, Provider } from "../types/messages"
import { resolveModelSelection } from "./model-selection"
import { parseModelString } from "../../../src/shared/provider-model"
import { useVSCode } from "./vscode"
import type { ExtensionMessage } from "../types/messages/extension-messages"


const RECENT_LIMIT = 5

export interface ModelSelectionStore {
  modelSelections: Record<string, ModelSelection | null> // agentName -> model
  sessionOverrides: Record<string, ModelSelection> // sessionID -> per-session model override
  variantSelections: Record<string, string> // "providerID/modelID" -> variant name
  recentModels: ModelSelection[]
  favoriteModels: ModelSelection[]
}

export interface ModelSelectionDependencies {
  currentSessionID: Accessor<string | undefined>
  selectedAgentName: Accessor<string>
  config: Accessor<any>
  providers: Accessor<Record<string, Provider>>
  connected: Accessor<string[]>
  vscode: ReturnType<typeof useVSCode>
  clearSessionError: (sessionID: string) => void
}

export function createModelSelectionLogic(deps: ModelSelectionDependencies) {
  const [store, setStore] = createStore<ModelSelectionStore>({
    modelSelections: {},
    sessionOverrides: {},
    variantSelections: {},
    recentModels: [],
    favoriteModels: [],
  })

  const [userSetAgents, setUserSetAgents] = createSignal<Record<string, boolean>>({})

  function getModeModel(agentName: string): ModelSelection | null {
    return parseModelString(deps.config().agent?.[agentName]?.model)
  }

  function getGlobalModel(): ModelSelection | null {
    return parseModelString(deps.config().model)
  }

  function resolveModel(agentName: string, override?: ModelSelection | null): ModelSelection | null {
    return resolveModelSelection({
      providers: deps.providers(),
      connected: deps.connected(),
      override,
      mode: getModeModel(agentName),
      global: getGlobalModel(),
      recent: store.recentModels,
      fallback: null,
    })
  }

  createEffect(() => {
    const agentName = deps.selectedAgentName()
    if (userSetAgents()[agentName]) return
    const sel = resolveModel(agentName)
    setStore("modelSelections", agentName, sel)
  })

  const selected = createMemo<ModelSelection | null>(() => {
    const sid = deps.currentSessionID()
    if (sid) {
      const session = store.sessionOverrides[sid]
      if (session) return session
    }
    const agentName = deps.selectedAgentName()
    return resolveModel(agentName, store.modelSelections[agentName])
  })

  function pushRecent(selection: ModelSelection) {
    const key = `${selection.providerID}/${selection.modelID}`
    const filtered = store.recentModels.filter((r) => `${r.providerID}/${r.modelID}` !== key)
    const updated = [selection, ...filtered].slice(0, RECENT_LIMIT)
    setStore("recentModels", updated)
    deps.vscode.postMessage({ type: "persistRecents", recents: updated })
  }

  function applyModel(agentName: string, selection: ModelSelection) {
    pushRecent(selection)
    setUserSetAgents((prev) => ({ ...prev, [agentName]: true }))
    setStore("modelSelections", agentName, selection)
    deps.vscode.postMessage({
      type: "persistModelSelection",
      agent: agentName,
      providerID: selection.providerID,
      modelID: selection.modelID,
    })
    const sid = deps.currentSessionID()
    if (sid) {
      setStore("sessionOverrides", sid, selection)
    }
  }

  function selectModel(providerID: string, modelID: string) {
    applyModel(deps.selectedAgentName(), { providerID, modelID })
    const sid = deps.currentSessionID()
    if (sid) {
      deps.clearSessionError(sid)
    }
  }

  const configModel = createMemo<ModelSelection | null>(() => {
    return resolveModel(deps.selectedAgentName())
  })

  const hasModelOverride = createMemo<boolean>(() => {
    const sel = selected()
    const cfg = configModel()
    if (!sel || !cfg) return false
    return sel.providerID !== cfg.providerID || sel.modelID !== cfg.modelID
  })

  function clearModelOverride() {
    const agentName = deps.selectedAgentName()
    setUserSetAgents((prev) => {
      const next = { ...prev }
      delete next[agentName]
      return next
    })
    setStore("modelSelections", produce((selections) => {
      delete selections[agentName]
    }))
    deps.vscode.postMessage({ type: "clearModelSelection", agent: agentName })
    const sid = deps.currentSessionID()
    if (sid) {
      setStore("sessionOverrides", produce((overrides) => {
        delete overrides[sid]
      }))
    }
  }

  function variantKey(sel: ModelSelection): string {
    return `${sel.providerID}/${sel.modelID}`
  }

  function variantList(): string[] {
    const sel = selected()
    if (!sel) return []
    const prov = deps.providers()?.[sel.providerID]
    if (!prov) return []
    const model = prov.models?.[sel.modelID]
    if (!model) return []
    if (!model.variants) return []
    const vData = model.variants as unknown as { order?: string[]; models?: Record<string, unknown>; default?: string }
    const order = vData.order || []
    const available = Object.keys(vData.models || {})
    const set = new Set(order)
    for (const a of available) {
      if (!set.has(a)) order.push(a)
    }
    return order
  }

  function currentVariant(): string | undefined {
    const sel = selected()
    if (!sel) return undefined
    const prov = deps.providers()?.[sel.providerID]
    const modelDef = prov?.models?.[sel.modelID]
    if (!modelDef?.variants) return undefined
    const vData = modelDef.variants as unknown as { order?: string[]; models?: Record<string, unknown>; default?: string }
    const stored = store.variantSelections[variantKey(sel)]
    if (stored && vData.models?.[stored]) return stored
    const defaultVar = vData.default
    if (defaultVar && vData.models?.[defaultVar]) return defaultVar
    return undefined
  }

  function selectVariant(value: string) {
    const sel = selected()
    if (!sel) return
    const key = variantKey(sel)
    setStore("variantSelections", key, value)
    deps.vscode.postMessage({ type: "persistVariant", key, value })
  }

  function toggleFavorite(providerID: string, modelID: string) {
    const key = `${providerID}/${modelID}`
    const idx = store.favoriteModels.findIndex((f) => `${f.providerID}/${f.modelID}` === key)
    const updated = idx >= 0 ? store.favoriteModels.filter((_, i) => i !== idx) : [...store.favoriteModels, { providerID, modelID }]
    setStore("favoriteModels", updated)
    const action = idx >= 0 ? "remove" : "add";
    deps.vscode.postMessage({ type: "toggleFavorite", action, providerID, modelID })
  }

  function handleMessage(message: ExtensionMessage) {
    if (message.type === "modelSelectionsLoaded") {
      setStore("modelSelections", reconcile(message.selections))
    } else if (message.type === "variantsLoaded") {
      for (const [k, v] of Object.entries(message.variants)) {
        setStore("variantSelections", k, v)
      }
    } else if (message.type === "recentsLoaded") {
      setStore("recentModels", message.recents)
    } else if (message.type === "favoritesLoaded") {
      setStore("favoriteModels", message.favorites)
    }
  }

  onMount(() => {
    deps.vscode.onMessage(handleMessage)
  })

  return {
    store,
    setStore,
    userSetAgents,
    resolveModel,
    selected,
    selectModel,
    hasModelOverride,
    clearModelOverride,
    variantList,
    currentVariant,
    selectVariant,
    favoriteModels: () => store.favoriteModels,
    toggleFavorite,
  }
}
