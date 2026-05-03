// stratacode_change - new file
export type FeatureKey =
  | "acpAgents"
  | "autocomplete"
  | "autoretries"
  | "browserAutomation"
  | "checkpoints"
  | "codeActions"
  | "commitMessage"
  | "diffViewer"
  | "documentDrivenTasks"
  | "explainer"
  | "kanban"
  | "lsp"
  | "notifications"
  | "planningMode"
  | "projectMemory"
  | "promptAutocomplete"
  | "promptEnhancer"
  | "promptEnhancerSuggestions"
  | "remoteControl"
  | "sessionSharing"
  | "workers"

export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  acpAgents: true,
  autocomplete: true,
  autoretries: true,
  browserAutomation: false,
  checkpoints: true,
  codeActions: true,
  commitMessage: true,
  diffViewer: true,
  documentDrivenTasks: false,
  explainer: true,
  kanban: false,
  lsp: true,
  notifications: true,
  planningMode: false,
  projectMemory: true,
  promptAutocomplete: true,
  promptEnhancer: true,
  promptEnhancerSuggestions: true,
  remoteControl: false,
  sessionSharing: false,
  workers: false,
}
