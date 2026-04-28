package ai.stratacode.backend.app

import ai.stratacode.jetbrains.api.model.Config
import ai.stratacode.jetbrains.api.model.StrataNotifications200ResponseInner
import ai.stratacode.jetbrains.api.model.StrataProfile200Response

/**
 * Full application lifecycle state, combining CLI transport connection
 * status with data-loading progress.
 *
 * [ConnectionState] stays internal to [StrataConnectionService] for the
 * transport layer. This sealed class is what the frontend observes.
 */
sealed class StrataAppState {
    data object Disconnected : StrataAppState()
    data object Connecting : StrataAppState()
    data class Loading(val progress: LoadProgress) : StrataAppState()
    data class Ready(val data: AppData) : StrataAppState()
    data class Error(val message: String, val errors: List<LoadError> = emptyList()) : StrataAppState()
}

/**
 * Tracks which global data fetches have completed during the [StrataAppState.Loading] phase.
 */
data class LoadProgress(
    val config: Boolean = false,
    val notifications: Boolean = false,
    val profile: ProfileResult = ProfileResult.PENDING,
)

/** Outcome of the profile fetch. */
enum class ProfileResult { PENDING, LOADED, NOT_LOGGED_IN }

/**
 * Error detail for a single resource that failed to load.
 */
data class LoadError(
    val resource: String,
    val status: Int? = null,
    val detail: String? = null,
)

/**
 * All global data that has been successfully loaded.
 * Present only in [StrataAppState.Ready].
 */
data class AppData(
    val profile: StrataProfile200Response?,
    val config: Config,
    val notifications: List<StrataNotifications200ResponseInner>,
)
