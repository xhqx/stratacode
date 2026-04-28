package ai.stratacode.client.testing

import ai.stratacode.rpc.StrataWorkspaceRpcApi
import ai.stratacode.rpc.dto.StrataWorkspaceStateDto
import ai.stratacode.rpc.dto.StrataWorkspaceStatusDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Fake [StrataWorkspaceRpcApi] for testing.
 *
 * Push workspace state changes via [state].
 * Directory resolution returns [directory].
 *
 * Every `suspend` method asserts it is NOT called on the EDT.
 */
class FakeWorkspaceRpcApi : StrataWorkspaceRpcApi {

    var directory = "/test"
    val state = MutableStateFlow(StrataWorkspaceStateDto(StrataWorkspaceStatusDto.PENDING))

    override suspend fun resolveProjectDirectory(hint: String): String {
        assertNotEdt("resolveProjectDirectory")
        return directory
    }

    override suspend fun state(directory: String): Flow<StrataWorkspaceStateDto> {
        assertNotEdt("state")
        return state
    }

    override suspend fun reload(directory: String) {
        assertNotEdt("reload")
    }
}
