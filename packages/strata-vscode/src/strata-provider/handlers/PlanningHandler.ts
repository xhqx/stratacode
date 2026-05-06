import type { MessageHandler, ProviderContext } from "../message-handlers"

export class PlanningHandler implements MessageHandler {
  readonly types = [
    "planning.requestState",
    "planning.add",
    "planning.update",
    "planning.remove",
    "planning.dispatch",
    "planning.confirm",
    "planning.applyMarkdown",
    "planning.requestMarkdownPreview",
    "planning.openPlanFile",
  ] as const

  async handle(message: any, ctx: ProviderContext): Promise<boolean> {
    const planningService = ctx.getPlanningService()

    switch (message.type) {
      case "planning.requestState":
        planningService?.pushState()
        planningService?.pushKanbanTasks()
        return true

      case "planning.add":
        planningService?.add(message)
        return true

      case "planning.update":
        planningService?.update(message.taskId, message.updates)
        return true

      case "planning.remove":
        planningService?.remove(message.taskId)
        return true

      case "planning.dispatch":
        planningService?.dispatch(message.taskId)
        return true

      case "planning.confirm":
        planningService?.confirm(message.taskId)
        return true

      case "planning.applyMarkdown":
        planningService?.applyMarkdownTasks()
        return true

      case "planning.requestMarkdownPreview":
        planningService?.pushMarkdownPreview()
        return true

      case "planning.openPlanFile":
        planningService?.openPlanFile(message.file, message.line)
        return true
    }

    return false
  }
}
