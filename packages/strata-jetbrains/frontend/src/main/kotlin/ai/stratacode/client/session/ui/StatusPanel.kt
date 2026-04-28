package ai.stratacode.client.session.ui

import ai.stratacode.client.plugin.StrataBundle
import ai.stratacode.client.session.SessionController
import ai.stratacode.client.session.SessionControllerEvent
import ai.stratacode.client.session.SessionControllerListener
import ai.stratacode.rpc.dto.StrataAppStateDto
import ai.stratacode.rpc.dto.StrataAppStatusDto
import ai.stratacode.rpc.dto.StrataWorkspaceStateDto
import ai.stratacode.rpc.dto.StrataWorkspaceStatusDto
import ai.stratacode.rpc.dto.ProfileStatusDto
import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.IconLoader
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.Font
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.Icon
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * Welcome panel showing app + workspace initialization progress.
 *
 * Pure view — listens to [SessionController] events and reads
 * [SessionModel][ai.stratacode.client.session.model.SessionModel] for data.
 * No coroutines, no service references.
 *
 * Uses icon+label rows for each resource being loaded. Icons act as
 * status indicators: animated spinner for loading, green check for
 * success, red circle for error, grey circle for idle.
 */
class StatusPanel(
    parent: Disposable,
    private val controller: SessionController,
) : JPanel(GridBagLayout()), SessionControllerListener, Disposable {

    init {
        Disposer.register(parent, this)
    }

    // ------ status icons ------

    private val iconLoading: Icon = AnimatedIcon.Default()
    private val iconOk: Icon = AllIcons.RunConfigurations.TestPassed
    private val iconError: Icon = AllIcons.RunConfigurations.TestFailed
    private val iconWarn: Icon = AllIcons.General.Warning
    private val iconIdle: Icon = AllIcons.RunConfigurations.TestNotRan

    // ------ header ------

    private val logo = JBLabel(
        IconLoader.getIcon("/icons/strata-content.svg", StatusPanel::class.java),
    ).apply {
        alignmentX = CENTER_ALIGNMENT
    }

    private val status = JBLabel().apply {
        alignmentX = CENTER_ALIGNMENT
        horizontalAlignment = SwingConstants.CENTER
        font = JBUI.Fonts.label(13f)
        foreground = UIUtil.getLabelForeground()
    }

    // ------ app rows ------

    private val configRow = row(StrataBundle.message("toolwindow.row.config"))
    private val notifRow = row(StrataBundle.message("toolwindow.row.notifications"))
    private val profileRow = row(StrataBundle.message("toolwindow.row.profile"))

    // ------ workspace rows ------

    private val providersRow = row(StrataBundle.message("toolwindow.row.providers"))
    private val agentsRow = row(StrataBundle.message("toolwindow.row.agents"))
    private val commandsRow = row(StrataBundle.message("toolwindow.row.commands"))
    private val skillsRow = row(StrataBundle.message("toolwindow.row.skills"))

    // ------ section headers ------

    private val appHeader = header(StrataBundle.message("toolwindow.section.app"))
    private val wsHeader = header(StrataBundle.message("toolwindow.section.workspace"))

    private val appSection = section(appHeader, configRow, notifRow, profileRow)
    private val wsSection = section(wsHeader, providersRow, agentsRow, commandsRow, skillsRow)

    init {
        isOpaque = false

        val body = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            border = JBUI.Borders.empty(12, 16)

            add(logo)
            add(Box.createVerticalStrut(JBUI.scale(12)))
            add(status)
            add(Box.createVerticalStrut(JBUI.scale(12)))
            add(appSection)
            add(Box.createVerticalStrut(JBUI.scale(12)))
            add(wsSection)
        }

        add(body, GridBagConstraints())

        resetAll()
        controller.addListener(this, this)
    }

    override fun onEvent(event: SessionControllerEvent) {
        when (event) {
            is SessionControllerEvent.AppChanged -> {
                renderApp(controller.model.app)
                revalidate()
                repaint()
            }

            is SessionControllerEvent.WorkspaceChanged -> {
                renderWorkspace(controller.model.workspace)
                revalidate()
                repaint()
            }

            else -> {}
        }
    }

    // ------ rendering ------

    private fun renderApp(state: StrataAppStateDto) {
        status.text = title(state)

        when (state.status) {
            StrataAppStatusDto.DISCONNECTED -> {
                resetAll()
            }
            StrataAppStatusDto.CONNECTING -> {
                configRow.loading()
                notifRow.loading()
                profileRow.loading()
            }
            StrataAppStatusDto.LOADING -> {
                val p = state.progress
                if (p != null) {
                    if (p.config) configRow.ok(StrataBundle.message("toolwindow.row.config")) else configRow.loading()
                    if (p.notifications) notifRow.ok(StrataBundle.message("toolwindow.row.notifications")) else notifRow.loading()
                    renderProfile(p.profile)
                }
            }
            StrataAppStatusDto.READY -> {
                val p = state.progress
                if (p != null) {
                    configRow.ok(StrataBundle.message("toolwindow.row.config"))
                    notifRow.ok(StrataBundle.message("toolwindow.row.notifications"))
                    renderProfile(p.profile)
                } else {
                    configRow.ok(StrataBundle.message("toolwindow.row.config"))
                    notifRow.ok(StrataBundle.message("toolwindow.row.notifications"))
                    profileRow.ok(StrataBundle.message("toolwindow.profile.loggedin"))
                }
            }
            StrataAppStatusDto.ERROR -> {
                val errors = state.errors.associate { it.resource to it }
                configRow.apply {
                    val detail = errors["config"]?.detail ?: StrataBundle.message("toolwindow.error.failed")
                    if ("config" in errors) error(StrataBundle.message("toolwindow.error.config", detail))
                    else ok(StrataBundle.message("toolwindow.row.config"))
                }
                notifRow.apply {
                    val detail = errors["notifications"]?.detail ?: StrataBundle.message("toolwindow.error.failed")
                    if ("notifications" in errors) error(StrataBundle.message("toolwindow.error.notifications", detail))
                    else ok(StrataBundle.message("toolwindow.row.notifications"))
                }
                profileRow.apply {
                    val detail = errors["profile"]?.detail ?: StrataBundle.message("toolwindow.error.failed")
                    if ("profile" in errors) error(StrataBundle.message("toolwindow.error.profile", detail))
                    else ok(StrataBundle.message("toolwindow.profile.loggedin"))
                }
            }
        }
    }

    private fun renderWorkspace(state: StrataWorkspaceStateDto) {
        val appReady = controller.model.app.status == StrataAppStatusDto.READY
        val visible = appReady || state.status != StrataWorkspaceStatusDto.PENDING
        wsSection.isVisible = visible
        if (!visible) return

        when (state.status) {
            StrataWorkspaceStatusDto.PENDING -> {
                providersRow.idle(StrataBundle.message("toolwindow.row.providers"))
                agentsRow.idle(StrataBundle.message("toolwindow.row.agents"))
                commandsRow.idle(StrataBundle.message("toolwindow.row.commands"))
                skillsRow.idle(StrataBundle.message("toolwindow.row.skills"))
            }
            StrataWorkspaceStatusDto.LOADING -> {
                val p = state.progress
                if (p != null) {
                    if (p.providers) providersRow.ok(StrataBundle.message("toolwindow.row.providers")) else providersRow.loading()
                    if (p.agents) agentsRow.ok(StrataBundle.message("toolwindow.row.agents")) else agentsRow.loading()
                    if (p.commands) commandsRow.ok(StrataBundle.message("toolwindow.row.commands")) else commandsRow.loading()
                    if (p.skills) skillsRow.ok(StrataBundle.message("toolwindow.row.skills")) else skillsRow.loading()
                } else {
                    providersRow.loading()
                    agentsRow.loading()
                    commandsRow.loading()
                    skillsRow.loading()
                }
            }
            StrataWorkspaceStatusDto.READY -> {
                val prov = state.providers?.providers?.size ?: 0
                val ag = state.agents?.all?.size ?: 0
                val cmd = state.commands.size
                val sk = state.skills.size
                providersRow.ok(StrataBundle.message("toolwindow.row.providers.count", prov))
                agentsRow.ok(StrataBundle.message("toolwindow.row.agents.count", ag))
                commandsRow.ok(StrataBundle.message("toolwindow.row.commands.count", cmd))
                skillsRow.ok(StrataBundle.message("toolwindow.row.skills.count", sk))
            }
            StrataWorkspaceStatusDto.ERROR -> {
                val msg = state.error ?: StrataBundle.message("toolwindow.error.unknown")
                providersRow.error(msg)
                agentsRow.idle(StrataBundle.message("toolwindow.row.agents"))
                commandsRow.idle(StrataBundle.message("toolwindow.row.commands"))
                skillsRow.idle(StrataBundle.message("toolwindow.row.skills"))
            }
        }
    }

    // ------ helpers ------

    private fun title(state: StrataAppStateDto): String =
        when (state.status) {
            StrataAppStatusDto.DISCONNECTED -> StrataBundle.message("toolwindow.status.disconnected")
            StrataAppStatusDto.CONNECTING -> StrataBundle.message("toolwindow.status.connecting")
            StrataAppStatusDto.LOADING -> StrataBundle.message("toolwindow.status.loading")
            StrataAppStatusDto.READY -> {
                val ver = controller.model.version
                if (ver != null) StrataBundle.message("toolwindow.status.connected.version", ver)
                else StrataBundle.message("toolwindow.status.connected")
            }
            StrataAppStatusDto.ERROR -> StrataBundle.message(
                "toolwindow.status.error",
                state.error ?: StrataBundle.message("toolwindow.error.unknown"),
            )
        }

    private fun renderProfile(profile: ProfileStatusDto) {
        when (profile) {
            ProfileStatusDto.LOADED -> profileRow.ok(StrataBundle.message("toolwindow.profile.loggedin"))
            ProfileStatusDto.NOT_LOGGED_IN -> profileRow.warn(StrataBundle.message("toolwindow.profile.notloggedin"))
            ProfileStatusDto.PENDING -> profileRow.loading(StrataBundle.message("toolwindow.row.profile"))
        }
    }

    private fun resetAll() {
        configRow.idle(StrataBundle.message("toolwindow.row.config"))
        notifRow.idle(StrataBundle.message("toolwindow.row.notifications"))
        profileRow.idle(StrataBundle.message("toolwindow.row.profile"))
        providersRow.idle(StrataBundle.message("toolwindow.row.providers"))
        agentsRow.idle(StrataBundle.message("toolwindow.row.agents"))
        commandsRow.idle(StrataBundle.message("toolwindow.row.commands"))
        skillsRow.idle(StrataBundle.message("toolwindow.row.skills"))
    }

    // ------ row factory ------

    private fun row(text: String): StatusRow = StatusRow(text, iconIdle)

    private fun header(text: String): JBLabel = JBLabel(text).apply {
        alignmentX = LEFT_ALIGNMENT
        font = JBUI.Fonts.label().deriveFont(JBUI.Fonts.label().style or Font.BOLD)
        foreground = UIUtil.getLabelForeground()
        border = JBUI.Borders.empty(0, 0, 4, 0)
    }

    private fun section(hdr: JBLabel, vararg rows: StatusRow): JPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        alignmentX = CENTER_ALIGNMENT
        add(hdr)
        for (r in rows) add(r.label)
    }

    inner class StatusRow(text: String, icon: Icon) {
        val label = JBLabel(text, icon, SwingConstants.LEFT).apply {
            font = JBUI.Fonts.label()
            foreground = UIUtil.getContextHelpForeground()
            iconTextGap = JBUI.scale(6)
            border = JBUI.Borders.empty(2, 0)
            alignmentX = LEFT_ALIGNMENT
        }

        fun ok(msg: String, ic: Icon = iconOk) {
            label.icon = ic
            label.text = msg
            label.foreground = UIUtil.getContextHelpForeground()
        }

        fun loading(msg: String = label.text) {
            label.icon = iconLoading
            label.text = msg
            label.foreground = UIUtil.getContextHelpForeground()
        }

        fun warn(msg: String) {
            label.icon = iconWarn
            label.text = msg
            label.foreground = UIUtil.getContextHelpForeground()
        }

        fun error(msg: String) {
            label.icon = iconError
            label.text = msg
            label.foreground = UIUtil.getErrorForeground()
        }

        fun idle(msg: String) {
            label.icon = iconIdle
            label.text = msg
            label.foreground = UIUtil.getContextHelpForeground()
        }
    }

    override fun dispose() {
        // Listener auto-removed by Disposer (registered in init via addListener)
    }
}
