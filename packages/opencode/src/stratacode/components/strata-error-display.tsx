import { createMemo, Match, Switch, type JSX } from "solid-js"
import { SplitBorder } from "@tui/component/border"
import { useTheme } from "@tui/context/theme"
import { parseStrataErrorCode, strataErrorTitle, strataErrorDescription } from "@/stratacode/strata-errors"
import type { AssistantMessage } from "@stratacode/sdk/v2"

interface StrataErrorBlockProps {
  error: NonNullable<AssistantMessage["error"]>
  fallback: JSX.Element
}

export function StrataErrorBlock(props: StrataErrorBlockProps) {
  const { theme } = useTheme()

  const strataErrorCode = createMemo(() => {
    return parseStrataErrorCode(props.error)
  })

  const title = createMemo(() => {
    const code = strataErrorCode()
    return code ? strataErrorTitle(code) : undefined
  })

  const description = createMemo(() => {
    const code = strataErrorCode()
    return code ? strataErrorDescription(code) : undefined
  })

  return (
    <Switch fallback={props.fallback}>
      <Match when={strataErrorCode()}>
        <box
          border={["left"]}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          marginTop={1}
          backgroundColor={theme.backgroundPanel}
          customBorderChars={SplitBorder.customBorderChars}
          borderColor={theme.primary}
        >
          <text fg={theme.text}>{title()}</text>
          <text fg={theme.textMuted}>{description()}</text>
          <text fg={theme.primary}>{"Run /connect or `strata auth login` to connect to Strata Gateway"}</text>
        </box>
      </Match>
    </Switch>
  )
}
