@file:Suppress("UnstableApiUsage")

package ai.stratacode.backend.rpc

import ai.stratacode.backend.app.StrataBackendAppService
import ai.stratacode.backend.app.StrataBackendChatManager
import ai.stratacode.backend.app.StrataBackendSessionManager
import ai.stratacode.backend.workspace.StrataBackendWorkspaceManager
import ai.stratacode.log.ChatLogSummary
import ai.stratacode.rpc.StrataSessionRpcApi
import ai.stratacode.rpc.dto.ChatEventDto
import ai.stratacode.rpc.dto.ConfigUpdateDto
import ai.stratacode.rpc.dto.MessageWithPartsDto
import ai.stratacode.rpc.dto.PermissionAlwaysRulesDto
import ai.stratacode.rpc.dto.PermissionReplyDto
import ai.stratacode.rpc.dto.PermissionRequestDto
import ai.stratacode.rpc.dto.PromptDto
import ai.stratacode.rpc.dto.QuestionReplyDto
import ai.stratacode.rpc.dto.QuestionRequestDto
import ai.stratacode.rpc.dto.SessionDto
import ai.stratacode.rpc.dto.SessionListDto
import ai.stratacode.rpc.dto.SessionStatusDto
import com.intellij.openapi.components.service
import ai.stratacode.log.StrataLog
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter

/**
 * Backend implementation of [StrataSessionRpcApi].
 *
 * Session CRUD routes through the [StrataBackendWorkspaceManager] to
 * get the correct workspace for a directory. Status tracking and
 * worktree directory management go directly to the
 * [StrataBackendSessionManager]. Chat operations delegate to
 * [StrataBackendChatManager].
 */
class StrataSessionRpcApiImpl : StrataSessionRpcApi {
    companion object {
        private val LOG = StrataLog.create(StrataSessionRpcApiImpl::class.java)
    }

    private val workspaces: StrataBackendWorkspaceManager
        get() = service<StrataBackendAppService>().workspaces

    private val sessions: StrataBackendSessionManager
        get() = service<StrataBackendAppService>().sessions

    private val chat: StrataBackendChatManager
        get() = service<StrataBackendAppService>().chat

    override suspend fun list(directory: String): SessionListDto =
        workspaces.get(directory).sessions()

    override suspend fun create(directory: String): SessionDto {
        LOG.info("create session: directory=$directory")
        return workspaces.get(directory).createSession()
    }

    override suspend fun get(id: String, directory: String): SessionDto {
        val dir = sessions.getDirectory(id, directory)
        return sessions.get(id, dir)
    }

    override suspend fun delete(id: String, directory: String) {
        val dir = sessions.getDirectory(id, directory)
        workspaces.get(dir).deleteSession(id)
    }

    override suspend fun statuses(): Flow<Map<String, SessionStatusDto>> =
        sessions.statuses

    override suspend fun setDirectory(id: String, directory: String) =
        sessions.setDirectory(id, directory)

    override suspend fun getDirectory(id: String, fallback: String): String =
        sessions.getDirectory(id, fallback)

    // ------ chat ------

    override suspend fun prompt(id: String, directory: String, prompt: PromptDto) {
        LOG.info("prompt RPC: session=$id, dir=$directory, parts=${prompt.parts.size}")
        chat.prompt(id, directory, prompt)
    }

    override suspend fun abort(id: String, directory: String) =
        chat.abort(id, directory)

    override suspend fun messages(id: String, directory: String): List<MessageWithPartsDto> =
        chat.messages(id, directory)

    override suspend fun events(id: String, directory: String): Flow<ChatEventDto> =
        chat.events.filter { event ->
            val sid = when (event) {
                is ChatEventDto.MessageUpdated -> event.sessionID
                is ChatEventDto.PartUpdated -> event.sessionID
                is ChatEventDto.PartDelta -> event.sessionID
                is ChatEventDto.PartRemoved -> event.sessionID
                is ChatEventDto.TurnOpen -> event.sessionID
                is ChatEventDto.TurnClose -> event.sessionID
                is ChatEventDto.Error -> event.sessionID
                is ChatEventDto.MessageRemoved -> event.sessionID
                is ChatEventDto.PermissionAsked -> event.sessionID
                is ChatEventDto.PermissionReplied -> event.sessionID
                is ChatEventDto.QuestionAsked -> event.sessionID
                is ChatEventDto.QuestionReplied -> event.sessionID
                is ChatEventDto.QuestionRejected -> event.sessionID
                is ChatEventDto.SessionStatusChanged -> event.sessionID
                is ChatEventDto.SessionIdle -> event.sessionID
                is ChatEventDto.SessionCompacted -> event.sessionID
                is ChatEventDto.SessionDiffChanged -> event.sessionID
                is ChatEventDto.TodoUpdated -> event.sessionID
            }
            val passes = sid == null || sid == id
            if (passes) LOG.debug { "${ChatLogSummary.sid(id)} pass=true ${ChatLogSummary.eventBody(event)}" }
            else LOG.debug { "${ChatLogSummary.sid(id)} pass=false srcSid=$sid ${ChatLogSummary.eventBody(event)}" }
            passes
        }

    override suspend fun updateConfig(directory: String, config: ConfigUpdateDto) =
        chat.updateConfig(directory, config)

    // ------ permission / question resolution ------

    override suspend fun replyPermission(requestId: String, directory: String, reply: PermissionReplyDto) {
        LOG.info("replyPermission: requestId=$requestId, reply=${reply.reply}")
        chat.replyPermission(requestId, directory, reply)
    }

    override suspend fun savePermissionRules(requestId: String, directory: String, rules: PermissionAlwaysRulesDto) {
        LOG.info("savePermissionRules: requestId=$requestId")
        chat.savePermissionRules(requestId, directory, rules)
    }

    override suspend fun replyQuestion(requestId: String, directory: String, answers: QuestionReplyDto) {
        LOG.info("replyQuestion: requestId=$requestId, answers=${answers.answers.size}")
        chat.replyQuestion(requestId, directory, answers)
    }

    override suspend fun rejectQuestion(requestId: String, directory: String) {
        LOG.info("rejectQuestion: requestId=$requestId")
        chat.rejectQuestion(requestId, directory)
    }

    override suspend fun pendingPermissions(directory: String): List<PermissionRequestDto> =
        chat.pendingPermissions(directory)

    override suspend fun pendingQuestions(directory: String): List<QuestionRequestDto> =
        chat.pendingQuestions(directory)
}
