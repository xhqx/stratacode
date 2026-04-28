package ai.stratacode.client.session

class ConfigSelectionTest : SessionControllerTestBase() {

    fun `test selectModel updates SessionModel and calls updateConfig`() {
        val m = controller()
        collect(m)
        flush()

        edt { m.selectModel("strata", "gpt-5") }
        flush()

        assertEquals(1, rpc.configs.size)
        assertEquals("strata/gpt-5", rpc.configs[0].second.model)
        assertSession(
            """
            [strata/gpt-5] [app: DISCONNECTED] [workspace: PENDING]
            """,
            m,
            show = false,
        )
    }

    fun `test selectAgent updates SessionModel and calls updateConfig`() {
        val m = controller()
        collect(m)
        flush()

        edt { m.selectAgent("plan") }
        flush()

        assertEquals(1, rpc.configs.size)
        assertEquals("plan", rpc.configs[0].second.agent)
        assertSession(
            """
            [plan] [app: DISCONNECTED] [workspace: PENDING]
            """,
            m,
            show = false,
        )
    }

    fun `test selectModel fires WorkspaceReady event`() {
        val m = controller()
        val events = collect(m)
        flush()
        events.clear()

        edt { m.selectModel("strata", "gpt-5") }
        flush()

        assertControllerEvents("WorkspaceReady", events)
    }
}
