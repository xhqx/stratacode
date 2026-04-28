package ai.stratacode.client.app

import ai.stratacode.rpc.dto.StrataWorkspaceStateDto
import kotlinx.coroutines.flow.StateFlow

/**
 * A workspace for a single directory. Mirrors the CLI concept of a
 * workspace — a directory with its providers, agents, commands, skills.
 *
 * Immutable reference — [state] flows internally as the workspace loads.
 * Lifecycle managed by [StrataWorkspaceService].
 */
class Workspace(
    val directory: String,
    val state: StateFlow<StrataWorkspaceStateDto>,
)
