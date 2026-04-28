package ai.stratacode.client.testing

import ai.stratacode.rpc.StrataAppRpcApi
import ai.stratacode.rpc.dto.HealthDto
import ai.stratacode.rpc.dto.StrataAppStateDto
import ai.stratacode.rpc.dto.StrataAppStatusDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Fake [StrataAppRpcApi] for testing.
 *
 * Push state changes via [state]. Health check returns [health].
 *
 * Every `suspend` method asserts it is NOT called on the EDT.
 */
class FakeAppRpcApi : StrataAppRpcApi {

    val state = MutableStateFlow(StrataAppStateDto(StrataAppStatusDto.DISCONNECTED))
    var health = HealthDto(healthy = true, version = "1.0.0")

    var connected = false
        private set

    override suspend fun connect() {
        assertNotEdt("connect")
        connected = true
    }

    override suspend fun state(): Flow<StrataAppStateDto> {
        assertNotEdt("state")
        return state
    }

    override suspend fun health(): HealthDto {
        assertNotEdt("health")
        return health
    }

    override suspend fun restart() {
        assertNotEdt("restart")
    }

    override suspend fun reinstall() {
        assertNotEdt("reinstall")
    }
}
