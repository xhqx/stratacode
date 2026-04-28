// StrataClaw status sidebar — instance info, bot presence, details

import { Show, createMemo } from "solid-js"
import { useClaw } from "../context/claw"
import { useStrataClawLanguage } from "../context/language"

function dot(status: string | null | undefined): string {
  if (!status) return "strataclaw-dot-offline"
  if (status === "running") return "strataclaw-dot-online"
  if (status === "starting" || status === "restarting") return "strataclaw-dot-warning"
  if (status === "destroying") return "strataclaw-dot-error"
  return "strataclaw-dot-offline"
}

function uptime(started: string | null | undefined): string {
  if (!started) return "\u2014"
  const ms = Date.now() - new Date(started).getTime()
  if (ms < 0) return "\u2014"
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

function capitalize(s: string | null | undefined, fallback: string): string {
  if (!s) return fallback
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function StatusSidebar() {
  const claw = useClaw()
  const { t } = useStrataClawLanguage()
  const status = createMemo(() => claw.status())

  return (
    <div class="strataclaw-sidebar">
      <h3 class="strataclaw-sidebar-title">{t("strataClaw.sidebar.title")}</h3>

      <Show when={status()}>
        <div class="strataclaw-sidebar-section">
          <div class="strataclaw-sidebar-label">{t("strataClaw.sidebar.instance")}</div>
          <div class="strataclaw-sidebar-row">
            <span class={`strataclaw-dot ${dot(status()!.status)}`} />
            <span>
              {capitalize(status()!.status, t("strataClaw.sidebar.unknown"))}
              <Show when={status()!.status === "running"}>
                <span class="strataclaw-sidebar-muted"> {uptime(status()!.lastStartedAt)}</span>
              </Show>
            </span>
          </div>
        </div>

        <div class="strataclaw-sidebar-section">
          <div class="strataclaw-sidebar-label">{t("strataClaw.sidebar.bot")}</div>
          <div class="strataclaw-sidebar-row">
            <span class={`strataclaw-dot ${claw.online() ? "strataclaw-dot-online" : "strataclaw-dot-offline"}`} />
            <span>{claw.online() ? t("strataClaw.chat.online") : t("strataClaw.chat.offline")}</span>
          </div>
        </div>

        <div class="strataclaw-sidebar-section">
          <div class="strataclaw-sidebar-label">{t("strataClaw.sidebar.details")}</div>
          <div class="strataclaw-sidebar-detail">
            <span class="strataclaw-sidebar-muted">{t("strataClaw.sidebar.region")}</span>
            <span>{status()!.flyRegion?.toUpperCase() ?? "\u2014"}</span>
          </div>
          <div class="strataclaw-sidebar-detail">
            <span class="strataclaw-sidebar-muted">{t("strataClaw.sidebar.version")}</span>
            <span>{status()!.openclawVersion ?? "\u2014"}</span>
          </div>
          <Show
            when={
              status()!.channelCount !== null &&
              status()!.channelCount !== undefined &&
              (status()!.channelCount ?? 0) >= 1
            }
          >
            <div class="strataclaw-sidebar-detail">
              <span class="strataclaw-sidebar-muted">{t("strataClaw.sidebar.channels")}</span>
              <span>{status()!.channelCount}</span>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={!status()}>
        <div class="strataclaw-sidebar-section">
          <span class="strataclaw-sidebar-muted">{t("strataClaw.sidebar.noData")}</span>
        </div>
      </Show>
    </div>
  )
}
