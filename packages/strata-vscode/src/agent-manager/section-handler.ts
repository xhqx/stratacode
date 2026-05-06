import type { WorktreeStateManager } from "./WorktreeStateManager"
import type { AgentManagerInMessage } from "./types"
import { type ChainResult, handled, unhandled } from "./chain-result"

/** Handle section CRUD messages. Returns a ChainResult indicating whether the message was handled. */
export function handleSection(
  state: WorktreeStateManager | undefined,
  m: AgentManagerInMessage,
  push: () => void,
): ChainResult {
  if (!state) return unhandled()
  if (m.type === "agentManager.createSection") state.addSection(m.name, m.color ?? null, m.worktreeIds)
  else if (m.type === "agentManager.renameSection") state.renameSection(m.sectionId, m.name)
  else if (m.type === "agentManager.deleteSection") state.deleteSection(m.sectionId)
  else if (m.type === "agentManager.setSectionColor") state.setSectionColor(m.sectionId, m.color)
  else if (m.type === "agentManager.toggleSectionCollapsed") state.toggleSection(m.sectionId)
  else if (m.type === "agentManager.moveToSection") state.moveToSection(m.worktreeIds, m.sectionId)
  else if (m.type === "agentManager.moveSection") state.moveSection(m.sectionId, m.dir)
  else return unhandled()
  push()
  return handled()
}
