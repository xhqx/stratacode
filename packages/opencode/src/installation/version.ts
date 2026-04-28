declare global {
  const STRATA_VERSION: string
  const STRATA_CHANNEL: string
  const STRATA_BUILD_KIND: string // stratacode_change
}

export const InstallationVersion = typeof STRATA_VERSION === "string" ? STRATA_VERSION : "local"
export const InstallationChannel = typeof STRATA_CHANNEL === "string" ? STRATA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
// stratacode_change start - distinguish release builds from source / local builds
export const InstallationBuildKind: "source" | "release" =
  typeof STRATA_BUILD_KIND === "string" && STRATA_BUILD_KIND === "release" ? "release" : "source"
// stratacode_change end
