// stratacode_change - new file
// Strata-specific overrides for the server control plane.
// Imported by ../../server/server.ts with minimal stratacode_change markers.

import { ModelCache } from "../../provider/model-cache"
import { Instance } from "../../project/instance"

/** Extra paths to skip request logging for */
export function skipLogging(path: string): boolean {
  return path === "/telemetry/capture" || path === "/global/health"
}

/** Additional CORS origin check for *.strata.ai */
export function corsOrigin(input: string): string | undefined {
  if (/^https:\/\/([a-z0-9-]+\.)*strata\.ai$/.test(input)) {
    return input
  }
  return undefined
}

/** Invalidate model cache and provider state after auth change */
export async function authChanged(providerID: string) {
  ModelCache.clear(providerID)
  await Instance.disposeAll()
}

export const DOC_TITLE = "strata"
export const DOC_DESCRIPTION = "strata api"
