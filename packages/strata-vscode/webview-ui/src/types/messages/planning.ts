import type { KanbanTask } from "./kanban"

export type PlanningStatus =
  | "planned" // Waiting for time/deps
  | "ready" // Deps met + time arrived, awaiting dispatch
  | "dispatched" // Session created + prompt sent
  | "needs_review" // Session idle — user should review
  | "done" // User confirmed complete
  | "failed" // Error during dispatch or session error

export interface PlanningTask {
  id: string
  title: string
  description?: string
  status: PlanningStatus
  created: string // ISO UTC timestamp

  // Scheduling
  startAt?: string // ISO UTC timestamp, minute precision
  deadline?: string // ISO UTC timestamp
  duration?: number // estimated duration in minutes
  priority: number // 1 (highest) – 5 (lowest), default 3

  // Dependencies
  dependsOn?: string[] // Array of PlanningTask IDs

  // Agent dispatch
  prompt: string
  agent?: string
  providerID?: string
  modelID?: string

  // Execution state (set by PlanningService, read-only in webview)
  sessionID?: string
  worktreeID?: string
  dispatchedAt?: string // ISO UTC timestamp
  completedAt?: string // ISO UTC timestamp
  error?: string // Last error message
}

// Derived subset for Kanban view
export type PlannedKanbanTask = KanbanTask & {
  column: "planned"
  source: "planned"
}
