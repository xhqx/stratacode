// stratacode_change - new file
export type FeatureKey =
  | "acpAgents"
  | "autoApprove"
  | "autocomplete"
  | "autoretries"
  | "batchTool"
  | "browserAutomation"
  | "checkpoints"
  | "codeActions"
  | "codebaseSearch"
  | "commitMessage"
  | "compaction"
  | "diffViewer"
  | "documentDrivenTasks"
  | "explainer"
  | "formatter"
  | "kanban"
  | "lsp"
  | "notifications"
  | "pasteSummary"
  | "planningMode"
  | "projectMemory"
  | "promptAutocomplete"
  | "promptEnhancer"
  | "promptEnhancerSuggestions"
  | "remoteControl"
  | "selectionTip"
  | "sessionSharing"
  | "taskTimeline"
  | "workers"

export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  acpAgents: true,
  autoApprove: true,
  autocomplete: true,
  autoretries: true,
  batchTool: false,
  browserAutomation: false,
  checkpoints: true,
  codeActions: true,
  codebaseSearch: false,
  commitMessage: true,
  compaction: true,
  diffViewer: true,
  documentDrivenTasks: false,
  explainer: true,
  formatter: true,
  kanban: false,
  lsp: true,
  notifications: true,
  pasteSummary: true,
  planningMode: false,
  projectMemory: true,
  promptAutocomplete: true,
  promptEnhancer: true,
  promptEnhancerSuggestions: true,
  remoteControl: false,
  selectionTip: true,
  sessionSharing: false,
  taskTimeline: true,
  workers: false,
}

