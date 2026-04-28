package ai.stratacode.client.session.ui

import ai.stratacode.client.app.StrataAppService
import ai.stratacode.client.app.StrataSessionService
import ai.stratacode.client.app.StrataWorkspaceService
import ai.stratacode.client.app.Workspace
import ai.stratacode.client.session.SessionController
import ai.stratacode.client.session.model.Question
import ai.stratacode.client.session.model.QuestionItem
import ai.stratacode.client.session.model.QuestionOption
import ai.stratacode.client.testing.FakeAppRpcApi
import ai.stratacode.client.testing.FakeSessionRpcApi
import ai.stratacode.client.testing.FakeWorkspaceRpcApi
import ai.stratacode.rpc.dto.StrataAppStateDto
import ai.stratacode.rpc.dto.StrataAppStatusDto
import ai.stratacode.rpc.dto.StrataWorkspaceStateDto
import ai.stratacode.rpc.dto.StrataWorkspaceStatusDto
import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import javax.swing.JPanel

@Suppress("UnstableApiUsage")
class QuestionPanelTest : BasePlatformTestCase() {

    private lateinit var parent: Disposable
    private lateinit var scope: CoroutineScope
    private lateinit var rpc: FakeSessionRpcApi
    private lateinit var app: StrataAppService
    private lateinit var workspaces: StrataWorkspaceService
    private lateinit var workspace: Workspace
    private lateinit var controller: SessionController
    private lateinit var panel: QuestionPanel

    override fun setUp() {
        super.setUp()
        parent = Disposer.newDisposable("question-panel")
        scope = CoroutineScope(SupervisorJob())
        rpc = FakeSessionRpcApi()
        val sessions = StrataSessionService(project, scope, rpc)
        val appRpc = FakeAppRpcApi().also { it.state.value = StrataAppStateDto(StrataAppStatusDto.READY) }
        val workspaceRpc = FakeWorkspaceRpcApi().also {
            it.state.value = StrataWorkspaceStateDto(status = StrataWorkspaceStatusDto.READY)
        }
        app = StrataAppService(scope, appRpc)
        workspaces = StrataWorkspaceService(scope, workspaceRpc)
        workspace = workspaces.workspace("/test")
        val root = JPanel()
        controller = SessionController(parent, "ses_test", sessions, workspace, app, scope, root)
        panel = QuestionPanel(controller)
    }

    override fun tearDown() {
        try {
            Disposer.dispose(parent)
            scope.cancel()
        } finally {
            super.tearDown()
        }
    }

    fun `test empty question hides panel and clears stale request id`() {
        panel.show(
            Question(
                id = "req_old",
                items = listOf(
                    QuestionItem(
                        question = "Pick one",
                        header = "Header",
                        options = listOf(QuestionOption("Yes", "desc")),
                        multiple = false,
                        custom = true,
                    )
                ),
            )
        )
        assertTrue(panel.isVisible)

        panel.show(Question(id = "req_new", items = emptyList()))

        assertFalse(panel.isVisible)
        assertEquals(0, panel.componentCount)
        assertTrue(rpc.questionReplies.isEmpty())
        assertTrue(rpc.questionRejects.isEmpty())
    }
}
