@file:Suppress("UnstableApiUsage")

package ai.stratacode.backend.rpc

import ai.stratacode.backend.app.StrataAppState
import ai.stratacode.backend.app.StrataBackendAppService
import ai.stratacode.backend.app.LoadError
import ai.stratacode.backend.app.LoadProgress
import ai.stratacode.backend.app.ProfileResult
import ai.stratacode.rpc.StrataAppRpcApi
import ai.stratacode.rpc.dto.HealthDto
import ai.stratacode.rpc.dto.StrataAppStateDto
import ai.stratacode.rpc.dto.StrataAppStatusDto
import ai.stratacode.rpc.dto.LoadErrorDto
import ai.stratacode.rpc.dto.LoadProgressDto
import ai.stratacode.rpc.dto.ProfileStatusDto
import com.intellij.openapi.components.service
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Backend implementation of [StrataAppRpcApi].
 *
 * Delegates directly to the app-level [StrataBackendAppService] —
 * no project resolution needed since all operations are app-scoped.
 */
class StrataAppRpcApiImpl : StrataAppRpcApi {

    private val app: StrataBackendAppService get() = service()

    override suspend fun connect() = app.connect()

    override suspend fun state(): Flow<StrataAppStateDto> =
        app.appState.map(::dto).distinctUntilChanged()

    override suspend fun health(): HealthDto = app.health()

    override suspend fun restart() = app.restart()

    override suspend fun reinstall() = app.reinstall()

    private fun dto(state: StrataAppState): StrataAppStateDto =
        when (state) {
            StrataAppState.Disconnected -> StrataAppStateDto(StrataAppStatusDto.DISCONNECTED)
            StrataAppState.Connecting -> StrataAppStateDto(StrataAppStatusDto.CONNECTING)
            is StrataAppState.Loading -> StrataAppStateDto(
                status = StrataAppStatusDto.LOADING,
                progress = progress(state.progress),
            )
            is StrataAppState.Ready -> StrataAppStateDto(
                status = StrataAppStatusDto.READY,
                progress = LoadProgressDto(
                    config = true,
                    notifications = true,
                    profile = if (state.data.profile != null) ProfileStatusDto.LOADED
                        else ProfileStatusDto.NOT_LOGGED_IN,
                ),
            )
            is StrataAppState.Error -> StrataAppStateDto(
                status = StrataAppStatusDto.ERROR,
                error = state.message,
                errors = state.errors.map(::error),
            )
        }

    private fun progress(p: LoadProgress) = LoadProgressDto(
        config = p.config,
        notifications = p.notifications,
        profile = when (p.profile) {
            ProfileResult.PENDING -> ProfileStatusDto.PENDING
            ProfileResult.LOADED -> ProfileStatusDto.LOADED
            ProfileResult.NOT_LOGGED_IN -> ProfileStatusDto.NOT_LOGGED_IN
        },
    )

    private fun error(e: LoadError) = LoadErrorDto(
        resource = e.resource,
        status = e.status,
        detail = e.detail,
    )
}
