package ai.stratacode.client.actions

import ai.stratacode.client.app.StrataAppService
import ai.stratacode.client.plugin.StrataBundle
import ai.stratacode.rpc.dto.StrataAppStatusDto
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service

/**
 * Non-interactive info row at the bottom of the settings popup showing
 * connection status and CLI version (from the last health check).
 */
class StatusInfoAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        // intentionally non-actionable
    }

    override fun update(e: AnActionEvent) {
        val svc = service<StrataAppService>()
        val status = when (svc.state.value.status) {
            StrataAppStatusDto.READY -> StrataBundle.message("toolwindow.status.connected.short")
            StrataAppStatusDto.CONNECTING -> StrataBundle.message("toolwindow.status.connecting.short")
            StrataAppStatusDto.LOADING -> StrataBundle.message("toolwindow.status.loading.short")
            StrataAppStatusDto.DISCONNECTED -> StrataBundle.message("toolwindow.status.disconnected.short")
            StrataAppStatusDto.ERROR -> StrataBundle.message("toolwindow.status.error.short")
        }
        val ver = svc.version?.let { " · $it" } ?: ""
        e.presentation.text = "$status$ver"
        e.presentation.isEnabled = false
    }
}
