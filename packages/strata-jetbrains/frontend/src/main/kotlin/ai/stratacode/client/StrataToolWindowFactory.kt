package ai.stratacode.client

import ai.stratacode.client.app.StrataAppService
import ai.stratacode.client.app.StrataSessionService
import ai.stratacode.client.session.SessionUi
import ai.stratacode.client.app.StrataWorkspaceService
import ai.stratacode.client.app.Workspace
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.components.service
import ai.stratacode.log.StrataLog
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Creates the Strata Code tool window with a single [SessionUi].
 *
 * Resolves the project directory through the backend (handles split-mode
 * where `project.basePath` is a synthetic frontend path) before creating
 * the workspace. The tool window shows a loading state until resolution
 * completes.
 */
class StrataToolWindowFactory : ToolWindowFactory, DumbAware {

    companion object {
        private val LOG = StrataLog.create(StrataToolWindowFactory::class.java)
    }

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        try {
            val workspaces = service<StrataWorkspaceService>()
            val sessions = project.service<StrataSessionService>()
            val app = service<StrataAppService>()
            val cs = CoroutineScope(SupervisorJob())
            val hint = project.basePath ?: ""

            cs.launch {
                val dir = workspaces.resolveProjectDirectory(hint)
                val workspace = workspaces.workspace(dir)
                withContext(Dispatchers.Main) {
                    setup(project, toolWindow, workspace, sessions, app, cs)
                }
            }
        } catch (e: Exception) {
            LOG.error("Failed to create Strata tool window content", e)
        }
    }

    private fun setup(
        project: Project,
        toolWindow: ToolWindow,
        workspace: Workspace,
        sessions: StrataSessionService,
        app: StrataAppService,
        cs: CoroutineScope,
    ) {
        try {
            val ui = SessionUi(project, workspace, sessions, app, cs)
            val content = ContentFactory.getInstance()
                .createContent(ui, "", false)
            content.setDisposer(ui)
            toolWindow.contentManager.addContent(content)

            ActionManager.getInstance().getAction("Strata.Settings")?.let {
                toolWindow.setTitleActions(listOf(it))
            }
        } catch (e: Exception) {
            LOG.error("Failed to set up Strata tool window content", e)
        }
    }
}
