import { createContext, useContext, createSignal, onCleanup } from "solid-js"
import type { ParentComponent, Accessor } from "solid-js"
import { useVSCode } from "./vscode"
import type { ExtensionMessage, RenderablePluginConfigSection } from "../types/messages"
import type { JSONValue } from "@stratacode/vscode-api"

export interface SaveError {
  message: string
  details?: string
}

interface PluginConfigContextValue {
  sections: Accessor<RenderablePluginConfigSection[]>
  loading: Accessor<boolean>
  values: Accessor<Record<string, Record<string, JSONValue>>>
  draft: Accessor<Record<string, Record<string, JSONValue>>>
  isDirty: (sectionId: string) => boolean
  saving: (sectionId: string) => boolean
  saveError: (sectionId: string) => SaveError | null
  updateValue: (sectionId: string, key: string, value: JSONValue) => void
  saveSection: (sectionId: string) => void
  discardSection: (sectionId: string) => void
}

export const PluginConfigContext = createContext<PluginConfigContextValue>()

export const PluginConfigProvider: ParentComponent = (props) => {
  const vscode = useVSCode()

  const [sections, setSections] = createSignal<RenderablePluginConfigSection[]>([])
  const [values, setValues] = createSignal<Record<string, Record<string, JSONValue>>>({})
  const [loading, setLoading] = createSignal(true)
  
  // Per-section state
  const [draft, setDraft] = createSignal<Record<string, Record<string, JSONValue>>>({})
  const [saved, setSaved] = createSignal<Record<string, Record<string, JSONValue>>>({})
  const [savingState, setSavingState] = createSignal<Record<string, boolean>>({})
  const [errorState, setErrorState] = createSignal<Record<string, SaveError | null>>({})

  const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type === "pluginConfigLoaded") {
      setSections(message.sections)
      
      const newValues = { ...values() }
      const newSaved = { ...saved() }
      
      for (const section of message.sections) {
        // Skip if a save is in-flight for this section
        if (savingState()[section.id]) continue
        
        const sectionValues = message.values[section.id] || {}
        newSaved[section.id] = sectionValues
        
        // Re-apply draft on top
        const sectionDraft = draft()[section.id] || {}
        newValues[section.id] = { ...sectionValues, ...sectionDraft }
      }
      
      setValues(newValues)
      setSaved(newSaved)
      setLoading(false)
      return
    }
    
    if (message.type === "pluginConfigUpdated") {
      const { sectionId, values: newValues } = message
      
      if (savingState()[sectionId]) {
        // Confirmed save
        setSavingState(prev => ({ ...prev, [sectionId]: false }))
        
        // Clear draft for this section
        setDraft(prev => {
          const next = { ...prev }
          delete next[sectionId]
          return next
        })
        
        setErrorState(prev => ({ ...prev, [sectionId]: null }))
      }
      
      setSaved(prev => ({ ...prev, [sectionId]: newValues }))
      
      // Re-apply draft on top in case another client updated config
      const currentDraft = draft()[sectionId] || {}
      setValues(prev => ({ ...prev, [sectionId]: { ...newValues, ...currentDraft } }))
      
      return
    }
    
    if (message.type === "pluginConfigUpdateFailed") {
      const { sectionId, message: errorMsg } = message
      setSavingState(prev => ({ ...prev, [sectionId]: false }))
      setErrorState(prev => ({ ...prev, [sectionId]: { message: errorMsg } }))
      return
    }
  })

  onCleanup(unsubscribe)

  // Request config immediately
  vscode.postMessage({ type: "requestPluginConfig" })

  const fallback = setTimeout(() => {
    if (loading()) {
      vscode.postMessage({ type: "requestPluginConfig" })
    }
  }, 3000)

  const unsubReady = vscode.onMessage((message: ExtensionMessage) => {
    if (message.type !== "extensionDataReady") return
    unsubReady()
    clearTimeout(fallback)
    if (loading()) {
      vscode.postMessage({ type: "requestPluginConfig" })
    }
  })

  onCleanup(() => {
    unsubReady()
    clearTimeout(fallback)
  })

  function updateValue(sectionId: string, key: string, value: JSONValue) {
    // Optimistic update
    setValues(prev => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] || {}), [key]: value }
    }))
    
    // Accumulate draft
    setDraft(prev => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] || {}), [key]: value }
    }))
    
    // Clear error
    setErrorState(prev => ({ ...prev, [sectionId]: null }))
  }

  function saveSection(sectionId: string) {
    const changes = draft()[sectionId]
    if (!changes || Object.keys(changes).length === 0) return
    
    setSavingState(prev => ({ ...prev, [sectionId]: true }))
    setErrorState(prev => ({ ...prev, [sectionId]: null }))
    
    vscode.postMessage({ type: "savePluginConfig", sectionId, changes })
  }

  function discardSection(sectionId: string) {
    setValues(prev => ({
      ...prev,
      [sectionId]: saved()[sectionId] || {}
    }))
    
    setDraft(prev => {
      const next = { ...prev }
      delete next[sectionId]
      return next
    })
    
    setErrorState(prev => ({ ...prev, [sectionId]: null }))
  }

  const value: PluginConfigContextValue = {
    sections,
    loading,
    values,
    draft,
    isDirty: (sectionId) => Object.keys(draft()[sectionId] || {}).length > 0,
    saving: (sectionId) => savingState()[sectionId] || false,
    saveError: (sectionId) => errorState()[sectionId] || null,
    updateValue,
    saveSection,
    discardSection
  }

  return <PluginConfigContext.Provider value={value}>{props.children}</PluginConfigContext.Provider>
}

export function usePluginConfig(): PluginConfigContextValue {
  const context = useContext(PluginConfigContext)
  if (!context) {
    throw new Error("usePluginConfig must be used within a PluginConfigProvider")
  }
  return context
}
