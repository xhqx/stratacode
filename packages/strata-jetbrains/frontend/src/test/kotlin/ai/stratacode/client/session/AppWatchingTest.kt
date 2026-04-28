package ai.stratacode.client.session

import ai.stratacode.rpc.dto.StrataAppStateDto
import ai.stratacode.rpc.dto.StrataAppStatusDto

class AppWatchingTest : SessionControllerTestBase() {

    fun `test app state change fires AppChanged`() {
        val m = controller()
        val events = collect(m)
        flush()
        events.clear()

        appRpc.state.value = StrataAppStateDto(StrataAppStatusDto.READY)
        flush()

        assertControllerEvents("AppChanged", events)
        assertSession(
            """
            [app: READY] [workspace: PENDING]
            """,
            m,
            show = false,
        )
    }
}
