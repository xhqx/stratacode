export type PlanningStatus = "planned" | "ready" | "dispatched" | "needs_review" | "done" | "failed"

export interface PlanningTask {
  id: string
  title: string
  description?: string
  status: PlanningStatus
  created: string // ISO date
  startAt?: string // ISO date
  deadline?: string // ISO date
  duration?: number // minutes
  priority: number // 1 (highest) - 5 (lowest)
  dependsOn?: string[] // task IDs

  // Agent configuration
  prompt: string
  agent?: string
  providerID?: string
  modelID?: string

  // Runtime tracking
  sessionID?: string
  worktreeID?: string
  dispatchedAt?: string // ISO date
  completedAt?: string // ISO date
  error?: string
}
