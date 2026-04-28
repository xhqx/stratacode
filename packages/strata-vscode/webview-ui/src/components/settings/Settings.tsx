import { Component, createSignal, createEffect, on, Show, For } from "solid-js"
import { Icon, type IconProps } from "@stratacode/strata-ui/icon"
import { Tabs } from "@stratacode/strata-ui/tabs"
import { Button } from "@stratacode/strata-ui/button"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import { useConfig } from "../../context/config"

import ProvidersTab from "./ProvidersTab"
import AgentBehaviourTab from "./AgentBehaviourTab"
import AutoApproveTab from "./AutoApproveTab"
import BrowserTab from "./BrowserTab"
import CheckpointsTab from "./CheckpointsTab"
import DisplayTab from "./DisplayTab"
import NotificationsTab from "./NotificationsTab"
import ContextTab from "./ContextTab"

import ExperimentalTab from "./ExperimentalTab"
import LanguageTab from "./LanguageTab"
import AboutStrataCodeTab from "./AboutStrataCodeTab"
import IndexingTab from "./IndexingTab"
import PluginSettingsTab from "./PluginSettingsTab"
import { useServer } from "../../context/server"
import { usePluginConfig } from "../../context/plugin-config"

export interface SettingsProps {
  tab?: string
  onTabChange?: (tab: string) => void
  onMigrateClick?: () => void // legacy-migration
}

const Settings: Component<SettingsProps> = (props) => {
  const server = useServer()
  const language = useLanguage()
  const vscode = useVSCode()
  const { saving, saveError, features } = useConfig()
  const pluginConfig = usePluginConfig()
  
  // Stale tab handling: if the active tab is a plugin tab but the section no longer exists,
  // fall back to "models". If it is a removed tab, fallback to "agentBehaviour".
  const activeTab = () => {
    const tab = props.tab ?? "agentBehaviour"
    if (tab === "autocomplete" || tab === "commitMessage" || tab === "models") {
      return "agentBehaviour"
    }
    if (tab.startsWith("plugin:")) {
      const sectionId = tab.replace("plugin:", "")
      if (!pluginConfig.sections().find(s => s.id === sectionId)) {
        return "agentBehaviour"
      }
    }
    return tab
  }
  
  const [active, setActive] = createSignal(activeTab())
  const [errorExpanded, setErrorExpanded] = createSignal(false)
  // Brief "Saved" indicator that appears after a successful auto-save
  const [saved, setSaved] = createSignal(false)
  let fadeTimer: ReturnType<typeof setTimeout> | undefined

  const isAnySaving = () => saving() || pluginConfig.sections().some(s => pluginConfig.saving(s.id))
  const anySaveError = () => saveError() || pluginConfig.sections().map(s => pluginConfig.saveError(s.id)).find(e => e !== null) || null

  // Show "Saved" briefly after a save completes
  createEffect(
    on(
      isAnySaving,
      (current, prev) => {
        if (prev && !current && !anySaveError()) {
          setSaved(true)
          clearTimeout(fadeTimer)
          fadeTimer = setTimeout(() => setSaved(false), 2000)
        }
      },
      { defer: true },
    ),
  )

  const open = (scope: "local" | "global") => {
    const label =
      scope === "global" ? language.t("settings.config.scope.global") : language.t("settings.config.scope.local")
    vscode.postMessage({
      type: "openConfigFile",
      scope,
      labels: {
        scope: label,
        statusLoaded: language.t("settings.config.status.loaded"),
        statusLoadedLegacy: language.t("settings.config.status.loadedLegacy"),
        statusNotLoaded: language.t("settings.config.status.notLoaded"),
        statusCreate: language.t("settings.config.status.create"),
        title: language.t("settings.config.title", { scope: label }),
        placeholder: language.t("settings.config.placeholder"),
        noWorkspace: language.t("settings.config.noWorkspace"),
        openFailed: language.t("settings.config.openFailed", { scope: label, message: "{{message}}" }),
        sourceXdg: language.t("settings.config.source.xdg"),
        sourceHomeStrata: language.t("settings.config.source.homeStrata"),
        sourceHomeStratacode: language.t("settings.config.source.homeStratacode"),
        sourceHomeOpencode: language.t("settings.config.source.homeOpencode"),
        sourceEnvFile: language.t("settings.config.source.envFile"),
        sourceEnvDir: language.t("settings.config.source.envDir"),
        sourceEnvContent: language.t("settings.config.source.envContent"),
        sourceProjectStrata: language.t("settings.config.source.projectStrata"),
        sourceProjectRoot: language.t("settings.config.source.projectRoot"),
        sourceProjectStratacode: language.t("settings.config.source.projectStratacode"),
        sourceProjectOpencode: language.t("settings.config.source.projectOpencode"),
      },
    })
  }

  // Sync when the parent changes the tab prop (e.g. via navigate message)
  createEffect(
    on(
      saveError,
      (err) => {
        if (err) setErrorExpanded(true)
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => pluginConfig.sections().map(s => pluginConfig.saveError(s.id)).find(e => e !== null),
      (err) => {
        if (err) setErrorExpanded(true)
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => props.tab,
      (tab) => {
        if (tab) setActive(tab)
      },
    ),
  )

  createEffect(() => {
    if (features().indexing || activeTab() !== "indexing") return
    onTabChange("providers")
  })

  const onTabChange = (tab: string) => {
    setActive(tab)
    props.onTabChange?.(tab)
    vscode.postMessage({ type: "settingsTabChanged", tab })
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%", "min-height": 0 }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          "border-bottom": "1px solid var(--border-weak-base)",
          display: "flex",
          "align-items": "center",
          "flex-wrap": "wrap",
          gap: "8px",
        }}
      >
        <h2 style={{ "font-size": "16px", "font-weight": "600", margin: 0, flex: 1 }}>
          {language.t("sidebar.settings")}
        </h2>
        <Button variant="secondary" size="small" icon="edit" onClick={() => open("local")}>
          {language.t("settings.openLocalConfig")}
        </Button>
        <Button variant="secondary" size="small" icon="edit" onClick={() => open("global")}>
          {language.t("settings.openGlobalConfig")}
        </Button>
      </div>

      {/* Settings tabs */}
      <Tabs
        orientation="vertical"
        variant="settings"
        value={active()}
        onChange={onTabChange}
        style={{ flex: 1, overflow: "hidden" }}
      >
        <Tabs.List>

          <Tabs.Trigger value="providers">
            <Icon name="providers" />
            <span class="label">{language.t("settings.providers.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="agentBehaviour">
            <Icon name="brain" />
            <span class="label">{language.t("settings.agentBehaviour.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="autoApprove">
            <Icon name="checklist" />
            <span class="label">{language.t("settings.autoApprove.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="browser">
            <Icon name="window-cursor" />
            <span class="label">{language.t("settings.browser.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="checkpoints">
            <Icon name="branch" />
            <span class="label">{language.t("settings.checkpoints.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="display">
            <Icon name="eye" />
            <span class="label">{language.t("settings.display.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="notifications">
            <Icon name="circle-check" />
            <span class="label">{language.t("settings.notifications.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="context">
            <Icon name="server" />
            <span class="label">{language.t("settings.context.title")}</span>
          </Tabs.Trigger>

          <Show when={features().indexing}>
            <Tabs.Trigger value="indexing">
              <Icon name="server" />
              <span class="label">{language.t("settings.indexing.title")}</span>
            </Tabs.Trigger>
          </Show>
          <Tabs.Trigger value="experimental">
            <Icon name="settings-gear" />
            <span class="label">{language.t("settings.experimental.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="language">
            <Icon name="speech-bubble" />
            <span class="label">{language.t("settings.language.title")}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="aboutStrataCode">
            <Icon name="help" />
            <span class="label">{language.t("settings.aboutStrataCode.title")}</span>
          </Tabs.Trigger>

          <Show when={pluginConfig.sections().length > 0}>
            <div
              style={{
                margin: "8px 0 4px",
                "padding-top": "8px",
                "border-top": "1px solid var(--border-weak-base)",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                "font-size": "10px",
                "font-weight": "600",
                "text-transform": "uppercase",
                "letter-spacing": "0.5px",
                "padding-left": "12px",
              }}
            >
              Extensions
            </div>
            <For each={pluginConfig.sections()}>
              {(section) => (
                <Tabs.Trigger value={`plugin:${section.id}`}>
                  <Icon name={(section.icon || "settings-gear") as IconProps["name"]} />
                  <span class="label">{section.title}</span>
                </Tabs.Trigger>
              )}
            </For>
          </Show>
        </Tabs.List>


        <Tabs.Content value="providers">
          <h3>{language.t("settings.providers.title")}</h3>
          <ProvidersTab />
        </Tabs.Content>
        <Tabs.Content value="agentBehaviour">
          <h3>{language.t("settings.agentBehaviour.title")}</h3>
          <AgentBehaviourTab />
        </Tabs.Content>
        <Tabs.Content value="autoApprove">
          <h3>{language.t("settings.autoApprove.title")}</h3>
          <AutoApproveTab />
        </Tabs.Content>
        <Tabs.Content value="browser">
          <h3>{language.t("settings.browser.title")}</h3>
          <BrowserTab />
        </Tabs.Content>
        <Tabs.Content value="checkpoints">
          <h3>{language.t("settings.checkpoints.title")}</h3>
          <CheckpointsTab />
        </Tabs.Content>
        <Tabs.Content value="display">
          <h3>{language.t("settings.display.title")}</h3>
          <DisplayTab />
        </Tabs.Content>
        <Tabs.Content value="notifications">
          <h3>{language.t("settings.notifications.title")}</h3>
          <NotificationsTab />
        </Tabs.Content>
        <Tabs.Content value="context">
          <h3>{language.t("settings.context.title")}</h3>
          <ContextTab />
        </Tabs.Content>

        <Show when={features().indexing}>
          <Tabs.Content value="indexing">
            <h3>{language.t("settings.indexing.title")}</h3>
            <IndexingTab />
          </Tabs.Content>
        </Show>
        <Tabs.Content value="experimental">
          <h3>{language.t("settings.experimental.title")}</h3>
          <ExperimentalTab />
        </Tabs.Content>
        <Tabs.Content value="language">
          <h3>{language.t("settings.language.title")}</h3>
          <LanguageTab />
        </Tabs.Content>
        <Tabs.Content value="aboutStrataCode">
          <h3>{language.t("settings.aboutStrataCode.title")}</h3>
          <AboutStrataCodeTab
            port={server.serverInfo()?.port ?? null}
            connectionState={server.connectionState()}
            extensionVersion={server.extensionVersion()}
            onMigrateClick={props.onMigrateClick}
          />
        </Tabs.Content>

        <For each={pluginConfig.sections()}>
          {(section) => (
            <Tabs.Content value={`plugin:${section.id}`}>
              <h3>{section.title}</h3>
              <PluginSettingsTab section={section} />
            </Tabs.Content>
          )}
        </For>
      </Tabs>

      {/* Auto-save error panel */}
      <Show when={anySaveError()}>
        {(err) => (
          <div class="settings-save-bar-error" style={{ margin: "0 16px 8px 16px" }}>
            <div
              class="settings-save-bar-error-header"
              onClick={() => setErrorExpanded((v) => !v)}
              role="button"
              aria-expanded={errorExpanded()}
            >
              <span
                class={`settings-save-bar-error-chevron${
                  errorExpanded() ? " settings-save-bar-error-chevron-expanded" : ""
                }`}
              >
                <Icon name="chevron-right" size="small" />
              </span>
              <span class="settings-save-bar-error-title">
                {language.t("settings.saveBar.saveFailed")}:{" "}
                <span class="settings-save-bar-error-firstline">{err().message}</span>
              </span>
            </div>
            <Show when={errorExpanded()}>
              <pre class="settings-save-bar-error-details">{err().details ?? err().message}</pre>
            </Show>
          </div>
        )}
      </Show>

      {/* Auto-save status indicator */}
      <Show when={isAnySaving() || saved() || anySaveError()}>
        <div
          class={`settings-autosave-status ${
            anySaveError()
              ? "settings-autosave-status-error"
              : isAnySaving()
                ? "settings-autosave-status-saving"
                : "settings-autosave-status-saved"
          }`}
        >
          <span class="settings-autosave-status-icon">
            <Icon
              name={anySaveError() ? "close" : isAnySaving() ? "reset" : "circle-check"}
              size="small"
            />
          </span>
          <span>
            {anySaveError()
              ? language.t("settings.saveBar.saveFailed")
              : isAnySaving()
                ? language.t("settings.saveBar.saving")
                : language.t("settings.saveBar.saved")}
          </span>
        </div>
      </Show>
    </div>
  )
}

export default Settings
