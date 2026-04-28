import { Component, For } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { TextField } from "@stratacode/strata-ui/text-field"
import { Select } from "@stratacode/strata-ui/select"
import { Card } from "@stratacode/strata-ui/card"

import { usePluginConfig } from "../../context/plugin-config"
import SettingsRow from "./SettingsRow"
import type { RenderablePluginConfigSection } from "../../types/messages"

const PluginSettingsTab: Component<{ section: RenderablePluginConfigSection }> = (props) => {
  const { values, updateValue } = usePluginConfig()

  return (
    <div>
      <Card>
        <For each={props.section.fields}>
          {(field, index) => {
            const isLast = index() === props.section.fields.length - 1
            const currentValue = () => {
              const sectionValues = values()[props.section.id] || {}
              const val = sectionValues[field.key]
              return val !== undefined && val !== null ? val : (field.default ?? "")
            }

            return (
              <SettingsRow title={field.label} description={field.description} last={isLast}>
                {field.type === "boolean" && (
                  <Switch
                    checked={!!currentValue()}
                    onChange={(checked) => updateValue(props.section.id, field.key, checked)}
                    hideLabel
                  >
                    {field.label}
                  </Switch>
                )}
                {field.type === "string" && (
                  <TextField
                    value={String(currentValue())}
                    onChange={(val) => updateValue(props.section.id, field.key, val)}
                  />
                )}
                {field.type === "number" && (
                  <TextField
                    type="number"
                    value={String(currentValue())}
                    onChange={(val) => {
                      const num = parseFloat(val)
                      if (!isNaN(num)) updateValue(props.section.id, field.key, num)
                    }}
                  />
                )}
                {field.type === "select" && field.options && (
                  <Select
                    current={String(currentValue())}
                    onSelect={(val) => updateValue(props.section.id, field.key, val as string)}
                    options={field.options.map(o => o.value)}
                    label={(val: string) => field.options?.find(o => o.value === val)?.label || val}
                    value={(val: string) => val}
                  />
                )}
              </SettingsRow>
            )
          }}
        </For>
      </Card>
    </div>
  )
}

export default PluginSettingsTab
