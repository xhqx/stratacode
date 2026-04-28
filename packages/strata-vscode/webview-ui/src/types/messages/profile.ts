// Strata notification types (mirrored from strata-gateway)
export interface StratacodeNotificationAction {
  actionText: string
  actionURL: string
}

export interface StratacodeNotification {
  id: string
  title: string
  message: string
  action?: StratacodeNotificationAction
  showIn?: string[]
  suggestModelId?: string
}

// Profile types from strata-gateway
export interface StratacodeBalance {
  balance: number
}

export interface ProfileData {
  profile: {
    email: string
    name?: string
    organizations?: Array<{ id: string; name: string; role: string }>
  }
  balance: StratacodeBalance | null
  currentOrgId: string | null
}
