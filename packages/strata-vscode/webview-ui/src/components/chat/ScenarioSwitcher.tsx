import { Component, createSignal, For } from "solid-js"
import { PopupSelector } from "../shared/PopupSelector"
import { Button } from "@stratacode/strata-ui/button"
import { ListTree } from "@stratacode/strata-ui/lucide"
import { Icon } from "@stratacode/strata-ui/icon"
import { Scenario } from "../../context/stratacode/scenario"

export interface ScenarioSwitcherProps {
  scenarios: Scenario[]
  selectedScenario: Scenario | undefined
  onSelect: (scenario: Scenario | undefined) => void
}

export const ScenarioSwitcher: Component<ScenarioSwitcherProps> = (props) => {
  const [open, setOpen] = createSignal(false)

  return (
    <PopupSelector
      open={open()}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="ghost"
          size="small"
          class={`h-6 px-1.5 min-w-0 ${props.selectedScenario ? "text-strata-primary" : "text-strata-subtle hover:text-strata-foreground"}`}
          title={props.selectedScenario ? `Scenario: ${props.selectedScenario.name}` : "Chat Scenarios"}
        >
          <ListTree size={14} />
        </Button>
      }
      expanded={false}
    >
      {(bodyH) => (
        <div class="py-1 min-w-[200px]" style={{ "max-height": bodyH() ? `${bodyH()}px` : undefined, "overflow-y": "auto" }}>
          <div class="px-2 py-1.5 text-xs font-medium text-strata-subtle uppercase tracking-wider">
            Chat Scenarios
          </div>
          <button
            class="w-full text-left px-2 py-1.5 text-sm flex items-center justify-between hover:bg-strata-hover transition-colors"
            onClick={() => {
              props.onSelect(undefined)
              setOpen(false)
            }}
          >
            <span>None</span>
            {!props.selectedScenario && <Icon name="check" size="small" class="text-strata-primary" />}
          </button>
          <For each={props.scenarios}>
            {(scenario) => (
              <button
                class="w-full text-left px-2 py-1.5 text-sm flex items-center justify-between hover:bg-strata-hover transition-colors group"
                onClick={() => {
                  props.onSelect(scenario)
                  setOpen(false)
                }}
              >
                <div class="flex flex-col gap-0.5">
                  <span>{scenario.name}</span>
                  <span class="text-xs text-strata-subtle group-hover:text-strata-foreground transition-colors">
                    {scenario.sequence.join(" → ")}
                  </span>
                </div>
                {props.selectedScenario?.name === scenario.name && (
                  <Icon name="check" size="small" class="text-strata-primary shrink-0 ml-2" />
                )}
              </button>
            )}
          </For>
        </div>
      )}
    </PopupSelector>
  )
}
