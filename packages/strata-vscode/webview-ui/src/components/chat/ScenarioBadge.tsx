import { Component, Show } from "solid-js"
import { useScenario } from "../../context/stratacode/scenario"
import { ListTree, X } from "@stratacode/strata-ui/lucide"

export const ScenarioBadge: Component = () => {
  const { activeScenario, scenarioIndex, cancelScenario } = useScenario()

  const step = () => scenarioIndex() + 1
  const total = () => activeScenario()?.length ?? 0

  return (
    <Show when={activeScenario()}>
      <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-strata-primary/10 border border-strata-primary/20 text-strata-primary text-[11px] font-medium select-none whitespace-nowrap">
        <ListTree size={12} />
        <span>
          Scenario (Step {step()}/{total()})
        </span>
        <button
          onClick={cancelScenario}
          class="ml-0.5 opacity-60 hover:opacity-100 transition-opacity focus:outline-none"
          title="Cancel Scenario"
        >
          <X size={12} />
        </button>
      </div>
    </Show>
  )
}
