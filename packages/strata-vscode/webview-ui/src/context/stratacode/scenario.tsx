import { createContext, useContext, createSignal, createEffect, onCleanup, ParentComponent } from "solid-js"
import { useSession } from "../session"
import { useConfig } from "../../context/config"
import { useVSCode } from "../vscode"

export interface Scenario {
  name: string
  sequence: string[]
}

export interface ScenarioContextValue {
  activeScenario: () => string[] | undefined
  scenarioIndex: () => number
  configuredScenarios: () => Scenario[]
  startScenario: (sequence: string[]) => void
  cancelScenario: () => void
}

const ScenarioContext = createContext<ScenarioContextValue | undefined>(undefined)

export const ScenarioProvider: ParentComponent = (props) => {
  const session = useSession()
  const { extensionFeatures } = useConfig()
  const vscode = useVSCode()

  const [configuredScenarios, setConfiguredScenarios] = createSignal<Scenario[]>([])
  const [activeScenario, setActiveScenario] = createSignal<string[] | undefined>(undefined)
  const [scenarioIndex, setScenarioIndex] = createSignal(0)

  // Track whether the session has been busy at least once since the scenario
  // started. Without this guard the effect fires on the initial "idle" state
  // (before the first agent even runs) and skips straight to step 2.
  const [armed, setArmed] = createSignal(false)

  // Listen for scenarios from the extension host
  const unsub = vscode.onMessage((message) => {
    if (message.type === "scenariosLoaded") {
      setConfiguredScenarios(message.scenarios)
    }
  })
  onCleanup(unsub)

  // Arm the orchestrator once the session transitions away from idle.
  // This ensures the first agent's message has actually been sent before
  // the auto-advance logic can fire.
  createEffect(() => {
    if (!activeScenario()) return
    const status = session.status()
    if (status !== "idle") {
      setArmed(true)
    }
  })

  // Orchestrate the scenario transitions based on session status
  createEffect(() => {
    if (!extensionFeatures().chatScenarios || !activeScenario() || !armed()) return

    const status = session.status()
    if (status !== "idle") return

    const messages = session.messages()
    const last = messages[messages.length - 1]

    // Abort scenario on error
    if (last?.error !== undefined) {
      setActiveScenario(undefined)
      setScenarioIndex(0)
      setArmed(false)
      return
    }

    // Advance only after receiving an assistant response
    if (last?.role !== "assistant") return

    const scenario = activeScenario()!
    const next = scenarioIndex() + 1

    // Scenario complete
    if (next >= scenario.length) {
      setActiveScenario(undefined)
      setScenarioIndex(0)
      setArmed(false)
      return
    }

    // Move to the next agent
    const agent = scenario[next]
    if (!agent) return

    setScenarioIndex(next)
    setArmed(false) // disarm until the next busy→idle cycle

    session.selectAgent(agent)

    // Dispatch on the next tick so Solid's reactive graph settles first
    setTimeout(() => {
      session.sendMessage("Continue with the next step based on the conversation so far.")
    }, 0)
  })

  const startScenario = (sequence: string[]) => {
    if (sequence.length > 0) {
      setActiveScenario(sequence)
      setScenarioIndex(0)
      setArmed(false)
    }
  }

  const cancelScenario = () => {
    setActiveScenario(undefined)
    setScenarioIndex(0)
    setArmed(false)
  }

  return (
    <ScenarioContext.Provider
      value={{
        activeScenario,
        scenarioIndex,
        configuredScenarios,
        startScenario,
        cancelScenario,
      }}
    >
      {props.children}
    </ScenarioContext.Provider>
  )
}

export const useScenario = (): ScenarioContextValue => {
  const context = useContext(ScenarioContext)
  if (!context) {
    throw new Error("useScenario must be used within a ScenarioProvider")
  }
  return context
}
