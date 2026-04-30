/**
 * VS Code-specific tool registry overrides.
 * Wraps upstream tool renderers to inject VS Code sidebar preferences
 * (e.g. auto-collapse on completion) without duplicating render logic.
 *
 * Call registerVscodeToolOverrides() once at app startup, after the
 * upstream tool registrations have run (i.e. after importing message-part).
 */

import { Dynamic } from "solid-js/web"
import { ToolRegistry } from "@stratacode/strata-ui/message-part"

/** Tools that should auto-collapse on completion in the VS Code sidebar. */
const COLLAPSIBLE_TOOLS = ["bash"]
const registered = new Set<string>()

export function registerVscodeToolOverrides() {
  for (const name of COLLAPSIBLE_TOOLS) {
    if (registered.has(name)) continue
    const upstream = ToolRegistry.render(name)
    if (!upstream) continue

    ToolRegistry.register({
      name,
      render: (props) => {
        const active = () => props.status === "pending" || props.status === "running"
        const done = () => props.status === "completed" || props.status === "error"
        return (
          <Dynamic
            component={upstream}
            {...props}
            defaultOpen
            forceOpen={active()}
            forceClose={done()}
          />
        )
      },
    })
    registered.add(name)
  }
}
