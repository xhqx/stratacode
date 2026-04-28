import { z } from "zod"
import { STRATA_API_BASE } from "./constants.js"

/**
 * Strata notification schema
 */
export const StratacodeNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  action: z
    .object({
      actionText: z.string(),
      actionURL: z.string(),
    })
    .optional(),
  showIn: z.array(z.string()).optional(),
  suggestModelId: z.string().optional(),
})

export type StratacodeNotification = z.infer<typeof StratacodeNotificationSchema>

const NotificationsResponseSchema = z.object({
  notifications: z.array(StratacodeNotificationSchema),
})

const NOTIFICATIONS_TIMEOUT_MS = 5000

/**
 * Fetch notifications from Strata API
 *
 * @param options - Configuration with token and optional organization ID
 * @returns Array of notifications from the Strata API (clients filter by showIn)
 */
export async function fetchStratacodeNotifications(options: {
  stratacodeToken?: string
  stratacodeOrganizationId?: string
}): Promise<StratacodeNotification[]> {
  const token = options.stratacodeToken
  if (!token) return []

  const url = `${STRATA_API_BASE}/api/users/notifications`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(NOTIFICATIONS_TIMEOUT_MS),
    })

    if (!response.ok) return []

    const json = await response.json()
    const result = NotificationsResponseSchema.safeParse(json)

    if (!result.success) return []

    return result.data.notifications
  } catch {
    return []
  }
}
