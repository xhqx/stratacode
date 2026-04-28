// StrataClaw root component

import { Switch, Match } from "solid-js"
import { ThemeProvider } from "@stratacode/strata-ui/theme"
import { MarkedProvider } from "@stratacode/strata-ui/context/marked"
import { Button } from "@stratacode/strata-ui/button"
import { Spinner } from "@stratacode/strata-ui/spinner"
import { Toast } from "@stratacode/strata-ui/toast"
import { ClawProvider, useClaw } from "./context/claw"
import { StrataClawLanguageProvider, useStrataClawLanguage } from "./context/language"
import { ChatPanel } from "./components/ChatPanel"
import { StatusSidebar } from "./components/StatusSidebar"
import { SetupView } from "./components/SetupView"
import { UpgradeView } from "./components/UpgradeView"

function Content() {
  const claw = useClaw()
  const { t } = useStrataClawLanguage()

  return (
    <div class="strataclaw-root">
      <Switch>
        <Match when={claw.phase() === "loading"}>
          <div class="strataclaw-center">
            <div class="strataclaw-loading">
              <Spinner />
              <span>{t("strataClaw.loading")}</span>
            </div>
          </div>
        </Match>
        <Match when={claw.phase() === "noInstance"}>
          <SetupView />
        </Match>
        <Match when={claw.phase() === "needsUpgrade"}>
          <UpgradeView />
        </Match>
        <Match when={claw.phase() === "error"}>
          <div class="strataclaw-center">
            <div class="strataclaw-error-view">
              <span class="strataclaw-error-text">{claw.error()}</span>
              <Button variant="primary" onClick={() => claw.retry()}>
                {t("strataClaw.error.retry")}
              </Button>
            </div>
          </div>
        </Match>
        <Match when={claw.phase() === "ready"}>
          <div class="strataclaw-layout">
            <ChatPanel />
            <StatusSidebar />
          </div>
        </Match>
      </Switch>
      <Toast.Region />
    </div>
  )
}

export function StrataClawApp() {
  return (
    <ThemeProvider defaultTheme="strata-vscode">
      <ClawProvider>
        <LanguageBridge>
          <MarkedProvider>
            <Content />
          </MarkedProvider>
        </LanguageBridge>
      </ClawProvider>
    </ThemeProvider>
  )
}

/** Bridges the claw context locale into the language provider. Must be below ClawProvider. */
function LanguageBridge(props: { children: any }) {
  const claw = useClaw()
  return <StrataClawLanguageProvider locale={claw.locale}>{props.children}</StrataClawLanguageProvider>
}
