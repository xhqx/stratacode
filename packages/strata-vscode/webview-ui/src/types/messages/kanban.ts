export type KanbanColumn = "planned" | "todo" | "progress" | "needs_action" | "done"

export const KANBAN_COLUMNS: KanbanColumn[] = ["planned", "todo", "progress", "needs_action", "done"]

export interface KanbanTask {
  id: string
  title: string
  description?: string
  column: KanbanColumn
  source: "manual" | "agent" | "planned"
  sessionID?: string
  created: string // ISO timestamp
}
