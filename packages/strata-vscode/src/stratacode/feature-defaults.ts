// stratacode_change - new file
import { MANIFEST } from "./feature-manifest"

export type FeatureKey = keyof typeof MANIFEST

const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = Object.fromEntries(
  Object.entries(MANIFEST).map(([k, v]) => [k, v.default]),
) as Record<FeatureKey, boolean>
