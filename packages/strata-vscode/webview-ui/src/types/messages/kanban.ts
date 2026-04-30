export type KanbanColumn = "todo" | "progress" | "needs_action" | "done"

export const KANBAN_COLUMNS: KanbanColumn[] = ["todo", "progress", "needs_action", "done"]

export interface KanbanTask {
  id: string
  title: string
  description?: string
  column: KanbanColumn
  source: "manual" | "agent"
  sessionID?: string
  created: string // ISO timestamp
}
