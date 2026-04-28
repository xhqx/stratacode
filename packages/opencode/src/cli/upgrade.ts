import { Bus } from "@/bus"
import { Config } from "@/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@/flag/flag"
import { Installation } from "@/installation"
import { InstallationVersion } from "@/installation/version"

export async function upgrade() {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  if (config.autoupdate === false || Flag.STRATA_DISABLE_AUTOUPDATE) return
  const method = await AppRuntime.runPromise(Installation.Service.use((svc) => svc.method()))
  // stratacode_change start - only auto-upgrade for npm/pnpm/bun (we only publish @stratacode/cli via npm registry)
  if (method !== "npm" && method !== "pnpm" && method !== "bun") return
  // stratacode_change end
  const latest = await AppRuntime.runPromise(Installation.Service.use((svc) => svc.latest(method))).catch(() => {})
  if (!latest) return

  if (Flag.STRATA_ALWAYS_NOTIFY_UPDATE) {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (InstallationVersion === latest) return

  const kind = Installation.getReleaseType(InstallationVersion, latest)

  if (config.autoupdate === "notify" || kind !== "patch") {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  await AppRuntime.runPromise(Installation.Service.use((svc) => svc.upgrade(method, latest)))
    .then(() => Bus.publish(Installation.Event.Updated, { version: latest }))
    .catch(() => {})
}
