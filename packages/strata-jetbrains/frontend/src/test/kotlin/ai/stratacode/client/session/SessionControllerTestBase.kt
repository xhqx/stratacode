package ai.stratacode.client.session

import ai.stratacode.client.app.StrataAppService
import ai.stratacode.client.app.StrataSessionService
import ai.stratacode.client.session.model.SessionModel
import ai.stratacode.client.session.model.SessionModelEvent
import ai.stratacode.client.session.model.SessionState
import ai.stratacode.client.testing.FakeAppRpcApi
import ai.stratacode.client.testing.FakeWorkspaceRpcApi
import ai.stratacode.client.testing.FakeSessionRpcApi
import ai.stratacode.client.app.StrataWorkspaceService
import ai.stratacode.client.app.Workspace
import ai.stratacode.rpc.dto.AgentDto
import ai.stratacode.rpc.dto.AgentsDto
import ai.stratacode.rpc.dto.ChatEventDto
import ai.stratacode.rpc.dto.StrataAppStateDto
import ai.stratacode.rpc.dto.StrataAppStatusDto
import ai.stratacode.rpc.dto.StrataWorkspaceStateDto
import ai.stratacode.rpc.dto.StrataWorkspaceStatusDto
import ai.stratacode.rpc.dto.MessageDto
import ai.stratacode.rpc.dto.MessageTimeDto
import ai.stratacode.rpc.dto.ModelDto
import ai.stratacode.rpc.dto.PartDto
import ai.stratacode.rpc.dto.ProviderDto
import ai.stratacode.rpc.dto.ProvidersDto
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.ui.UIUtil
import java.awt.event.HierarchyEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

/**
 * Base class for [SessionController] tests.
 *
 * Provides real IntelliJ Application/EDT/Disposer via [BasePlatformTestCase],
 * real frontend services wired to fake RPC backends, and shared helpers.
 */
abstract class SessionControllerTestBase : BasePlatformTestCase() {

    protected data class Snapshot(
        val body: String,
        val turns: String,
        val state: SessionState,
        val diff: List<ai.stratacode.rpc.dto.DiffFileDto>,
        val todos: List<ai.stratacode.rpc.dto.TodoDto>,
        val compacted: Int,
    ) {
        override fun toString(): String = buildString {
            appendLine("state=$state")
            appendLine("turns=$turns")
            appendLine("diff=$diff")
            appendLine("todos=$todos")
            appendLine("compacted=$compacted")
            append("body=\n$body")
        }
    }

    private class Root : javax.swing.JPanel() {
        private var shown = true
        override fun isShowing(): Boolean = shown
        fun showState(show: Boolean) {
            val prev = shown
            shown = show
            if (prev == show) return
            val event = HierarchyEvent(
                this,
                HierarchyEvent.HIERARCHY_CHANGED,
                this,
                this.parent,
                HierarchyEvent.SHOWING_CHANGED.toLong(),
            )
            hierarchyListeners.forEach { it.hierarchyChanged(event) }
        }
    }

    private val controllers = mutableListOf<SessionController>()
    private val roots = mutableMapOf<SessionController, Root>()

    protected lateinit var rpc: FakeSessionRpcApi
    protected lateinit var appRpc: FakeAppRpcApi
    protected lateinit var projectRpc: FakeWorkspaceRpcApi

    protected lateinit var sessions: StrataSessionService
    protected lateinit var app: StrataAppService
    protected lateinit var workspaces: StrataWorkspaceService
    protected lateinit var workspace: Workspace

    protected lateinit var scope: CoroutineScope
    protected lateinit var parent: Disposable

    override fun setUp() {
        super.setUp()
        rpc = FakeSessionRpcApi()
        appRpc = FakeAppRpcApi()
        projectRpc = FakeWorkspaceRpcApi()

        scope = CoroutineScope(SupervisorJob())
        parent = Disposer.newDisposable("test")

        sessions = StrataSessionService(project, scope, rpc)
        app = StrataAppService(scope, appRpc)
        workspaces = StrataWorkspaceService(scope, projectRpc)
        workspace = workspaces.workspace("/test")
    }

    override fun tearDown() {
        try {
            Disposer.dispose(parent)
            scope.cancel()
        } finally {
            super.tearDown()
        }
    }

    // ------ Controller creation ------

    protected fun controller(id: String? = null) = controller(id, Long.MAX_VALUE)

    protected fun controller(id: String? = null, flushMs: Long): SessionController {
        return controller(id, flushMs, true)
    }

    protected fun controller(id: String? = null, flushMs: Long, condense: Boolean): SessionController {
        val root = Root()
        val m = SessionController(parent, id, sessions, workspace, app, scope, root, flushMs, condense)
        controllers.add(m)
        roots[m] = root
        return m
    }

    protected fun hide(m: SessionController) {
        edt { (roots[m] ?: error("missing root")).showState(false) }
    }

    protected fun show(m: SessionController) {
        edt { (roots[m] ?: error("missing root")).showState(true) }
    }

    // ------ Event collection ------

    /** Attach a listener that collects lifecycle events and asserts EDT. */
    protected fun collect(m: SessionController): MutableList<SessionControllerEvent> {
        val events = mutableListOf<SessionControllerEvent>()
        val disposable = Disposer.newDisposable("listener")
        Disposer.register(parent, disposable)
        m.addListener(disposable) { event ->
            assertTrue("Listener must be called on EDT", ApplicationManager.getApplication().isDispatchThread)
            events.add(event)
        }
        return events
    }

    /** Attach a listener that collects model events (messages, parts, phase). */
    protected fun collectModelEvents(m: SessionController): MutableList<SessionModelEvent> {
        val events = mutableListOf<SessionModelEvent>()
        val disposable = Disposer.newDisposable("model-listener")
        Disposer.register(parent, disposable)
        m.model.addListener(disposable) { event ->
            events.add(event)
        }
        return events
    }

    // ------ EDT + coroutine helpers ------

    /** Let coroutines settle without forcing buffered controller delivery. */
    protected fun settle() = runBlocking {
        repeat(5) {
            delay(100)
            edt { UIUtil.dispatchAllInvocationEvents() }
        }
    }

    /** Let coroutines settle, force buffered controller delivery, then drain EDT. */
    protected fun flush() = runBlocking {
        repeat(5) {
            delay(100)
            controllers.forEach { it.flushEvents() }
            edt { UIUtil.dispatchAllInvocationEvents() }
        }
    }

    protected fun edt(block: () -> Unit) {
        ApplicationManager.getApplication().invokeAndWait(block)
    }

    /** Emit a chat event into the fake RPC flow. */
    protected fun emit(event: ChatEventDto, flush: Boolean = true) {
        runBlocking { rpc.events.emit(event) }
        if (flush) flush()
    }

    /** Create a controller, attach both listeners, send initial prompt, and flush. */
    protected fun prompted(): Triple<SessionController, MutableList<SessionControllerEvent>, MutableList<SessionModelEvent>> {
        appRpc.state.value = StrataAppStateDto(StrataAppStatusDto.READY)
        projectRpc.state.value = workspaceReady()
        val m = controller()
        val events = collect(m)
        val modelEvents = collectModelEvents(m)
        flush()
        edt { m.prompt("go") }
        flush()
        return Triple(m, events, modelEvents)
    }

    protected fun assertModel(expected: String, model: SessionModel) {
        assertEquals(expected.trimIndent().trim(), model.toString().trim())
    }

    protected fun assertModel(expected: String, c: SessionController) {
        assertModel(expected, c.model)
    }

    protected fun assertSession(expected: String, c: SessionController, show: Boolean = true) {
        assertEquals(expected.trimIndent().trim(), c.toString().trim())
        assertEquals(show, c.model.showMessages)
    }

    protected fun assertControllerEvents(expected: String, events: List<SessionControllerEvent>) {
        val exp = expected.trimIndent().lines().map { it.trim() }.filter { it.isNotEmpty() }.sorted()
        val act = events.map { it.toString() }.sorted()
        assertEquals(exp.joinToString("\n"), act.joinToString("\n"))
    }

    protected fun assertModelEvents(expected: String, events: List<SessionModelEvent>) {
        assertEquals(expected.trimIndent().trim(), events.joinToString("\n"))
    }

    protected fun snapshot(c: SessionController) = Snapshot(
        body = c.model.toString().trim(),
        turns = c.model.toTurnsString().trim(),
        state = c.model.state,
        diff = c.model.diff.toList(),
        todos = c.model.todos.toList(),
        compacted = c.model.compactionCount,
    )

    // ------ DTO factories ------

    protected fun msg(id: String, sid: String, role: String) = MessageDto(
        id = id,
        sessionID = sid,
        role = role,
        time = MessageTimeDto(created = 0.0),
    )

    protected fun part(
        id: String,
        sid: String,
        mid: String,
        type: String,
        text: String? = null,
        tool: String? = null,
        state: String? = null,
        title: String? = null,
    ) = PartDto(
        id = id,
        sessionID = sid,
        messageID = mid,
        type = type,
        text = text,
        tool = tool,
        state = state,
        title = title,
    )

    protected fun workspaceReady(
        agents: List<AgentDto> = listOf(AgentDto(name = "code", displayName = "Code", mode = "code")),
        default: String = "code",
        providers: List<ProviderDto> = listOf(
            ProviderDto(
                id = "strata",
                name = "Strata",
                models = mapOf("gpt-5" to ModelDto(id = "gpt-5", name = "GPT-5")),
            ),
        ),
        connected: List<String> = listOf("strata"),
        defaults: Map<String, String> = mapOf("strata" to "gpt-5"),
    ) = StrataWorkspaceStateDto(
        status = StrataWorkspaceStatusDto.READY,
        agents = AgentsDto(agents = agents, all = agents, default = default),
        providers = ProvidersDto(providers = providers, connected = connected, defaults = defaults),
    )
}
