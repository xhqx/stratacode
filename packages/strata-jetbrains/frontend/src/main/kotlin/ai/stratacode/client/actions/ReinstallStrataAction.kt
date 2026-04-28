package ai.stratacode.client.actions

import ai.stratacode.client.app.StrataAppService
import ai.stratacode.rpc.dto.StrataAppStatusDto
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service

class ReinstallStrataAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        service<StrataAppService>().reinstallAsync()
    }

    override fun update(e: AnActionEvent) {
        val status = service<StrataAppService>().state.value.status
        e.presentation.isEnabled = status != StrataAppStatusDto.CONNECTING && status != StrataAppStatusDto.LOADING
    }
}
