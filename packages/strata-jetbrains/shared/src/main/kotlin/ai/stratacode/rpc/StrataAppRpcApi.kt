package ai.stratacode.rpc

import ai.stratacode.rpc.dto.HealthDto
import ai.stratacode.rpc.dto.StrataAppStateDto
import com.intellij.platform.rpc.RemoteApiProviderService
import fleet.rpc.RemoteApi
import fleet.rpc.Rpc
import fleet.rpc.remoteApiDescriptor
import kotlinx.coroutines.flow.Flow

/**
 * App-level RPC API exposed from backend to frontend.
 *
 * All operations are project-neutral — the CLI backend runs once
 * per application, not per project.
 */
@Rpc
interface StrataAppRpcApi : RemoteApi<Unit> {
    companion object {
        suspend fun getInstance(): StrataAppRpcApi {
            return RemoteApiProviderService.resolve(remoteApiDescriptor<StrataAppRpcApi>())
        }
    }

    /** Ensure the CLI backend is running and connected. */
    suspend fun connect()

    /** Observe app lifecycle state changes. */
    suspend fun state(): Flow<StrataAppStateDto>

    /** One-shot health check against /global/health. */
    suspend fun health(): HealthDto

    /** Kill the CLI process and restart it. */
    suspend fun restart()

    /** Kill the CLI process, re-extract the binary, and restart. */
    suspend fun reinstall()
}
