import { Component } from "solid-js"
import { Switch } from "@stratacode/strata-ui/switch"
import { Card } from "@stratacode/strata-ui/card"
import { useVSCode } from "../../context/vscode"
import { useConfig } from "../../context/config"
import SettingsRow from "./SettingsRow"

const FeaturesTab: Component = () => {
  const vscode = useVSCode()
  const { extensionFeatures } = useConfig()

  const save = (key: string, value: boolean) => {
    vscode.postMessage({ type: "updateSetting", key: `features.${key}`, value })
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title="ACP Agents"
          description="Enable Agent Communication Protocol agents integration."
        >
          <Switch
            checked={extensionFeatures().acpAgents}
            onChange={(checked) => save("acpAgents", checked)}
            hideLabel
          >
            ACP Agents
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Autocomplete"
          description="Enable all autocomplete features (inline completions, chat autocomplete, task suggestions). Disabling requires a window reload."
        >
          <Switch
            checked={extensionFeatures().autocomplete}
            onChange={(checked) => save("autocomplete", checked)}
            hideLabel
          >
            Autocomplete
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Auto-Retries"
          description="Enable automatic retry logic for failed AI requests with exponential backoff."
        >
          <Switch
            checked={extensionFeatures().autoretries}
            onChange={(checked) => save("autoretries", checked)}
            hideLabel
          >
            Auto-Retries
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Browser Automation"
          description="Enable AI browser tools for UI testing and navigation. Disabling requires a window reload."
        >
          <Switch
            checked={extensionFeatures().browserAutomation}
            onChange={(checked) => save("browserAutomation", checked)}
            hideLabel
          >
            Browser Automation
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Checkpoints"
          description="Enable git-based checkpoints for tracking and reverting AI changes."
        >
          <Switch
            checked={extensionFeatures().checkpoints}
            onChange={(checked) => save("checkpoints", checked)}
            hideLabel
          >
            Checkpoints
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Code Actions"
          description="Enable AI-powered Quick Fixes and code actions in the editor. Disabling requires a window reload."
        >
          <Switch
            checked={extensionFeatures().codeActions}
            onChange={(checked) => save("codeActions", checked)}
            hideLabel
          >
            Code Actions
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Commit Message"
          description="Enable AI-generated commit messages in the Source Control panel. Disabling requires a window reload."
        >
          <Switch
            checked={extensionFeatures().commitMessage}
            onChange={(checked) => save("commitMessage", checked)}
            hideLabel
          >
            Commit Message
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Diff Viewer"
          description="Enable the Changes tab, AI explain commands, and diff viewer panel. Disabling requires a window reload."
        >
          <Switch
            checked={extensionFeatures().diffViewer}
            onChange={(checked) => save("diffViewer", checked)}
            hideLabel
          >
            Diff Viewer
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Document-Driven Tasks"
          description="Enable document-driven task execution from markdown plans and specs."
        >
          <Switch
            checked={extensionFeatures().documentDrivenTasks}
            onChange={(checked) => save("documentDrivenTasks", checked)}
            hideLabel
          >
            Document-Driven Tasks
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Explainer"
          description="Enable the standalone AI explainer for code selection and symbol explanations."
        >
          <Switch
            checked={extensionFeatures().explainer}
            onChange={(checked) => save("explainer", checked)}
            hideLabel
          >
            Explainer
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Kanban"
          description="Enable the Kanban task board for tracking AI-generated tasks."
        >
          <Switch
            checked={extensionFeatures().kanban}
            onChange={(checked) => save("kanban", checked)}
            hideLabel
          >
            Kanban
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="LSP"
          description="Enable Language Server Protocol integration for diagnostics and code intelligence."
        >
          <Switch
            checked={extensionFeatures().lsp}
            onChange={(checked) => save("lsp", checked)}
            hideLabel
          >
            LSP
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Notifications"
          description="Enable in-app notification center for agent activity and system events."
        >
          <Switch
            checked={extensionFeatures().notifications}
            onChange={(checked) => save("notifications", checked)}
            hideLabel
          >
            Notifications
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Planning Mode"
          description="Enable planning mode for structured multi-step task orchestration."
        >
          <Switch
            checked={extensionFeatures().planningMode}
            onChange={(checked) => save("planningMode", checked)}
            hideLabel
          >
            Planning Mode
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Project Memory"
          description="Enable project memory for persisting context across sessions."
        >
          <Switch
            checked={extensionFeatures().projectMemory}
            onChange={(checked) => save("projectMemory", checked)}
            hideLabel
          >
            Project Memory
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Prompt Autocomplete"
          description="Enable AI-powered autocomplete suggestions in the chat input."
        >
          <Switch
            checked={extensionFeatures().promptAutocomplete}
            onChange={(checked) => save("promptAutocomplete", checked)}
            hideLabel
          >
            Prompt Autocomplete
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Prompt Enhancer"
          description="Enable the prompt enhancer to refine and improve user prompts before sending."
        >
          <Switch
            checked={extensionFeatures().promptEnhancer}
            onChange={(checked) => save("promptEnhancer", checked)}
            hideLabel
          >
            Prompt Enhancer
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Prompt Enhancer Suggestions"
          description="Show inline suggestions from the prompt enhancer as you type."
        >
          <Switch
            checked={extensionFeatures().promptEnhancerSuggestions}
            onChange={(checked) => save("promptEnhancerSuggestions", checked)}
            hideLabel
          >
            Prompt Enhancer Suggestions
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Remote Control"
          description="Enable remote control API for external tool integration."
        >
          <Switch
            checked={extensionFeatures().remoteControl}
            onChange={(checked) => save("remoteControl", checked)}
            hideLabel
          >
            Remote Control
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Session Sharing"
          description="Enable session sharing and cloud sync for collaborative workflows."
        >
          <Switch
            checked={extensionFeatures().sessionSharing}
            onChange={(checked) => save("sessionSharing", checked)}
            hideLabel
          >
            Session Sharing
          </Switch>
        </SettingsRow>

        <SettingsRow
          title="Workers"
          description="Enable background context workers. Configure in your project's strata.jsonc file under the workers key."
          last
        >
          <Switch
            checked={extensionFeatures().workers}
            onChange={(checked) => save("workers", checked)}
            hideLabel
          >
            Workers
          </Switch>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default FeaturesTab
