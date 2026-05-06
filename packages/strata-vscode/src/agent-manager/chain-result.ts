export type ChainResult = { handled: true; response: Record<string, unknown> | null } | { handled: false }

export const handled = (response: Record<string, unknown> | null = null): ChainResult => ({ handled: true, response })
export const unhandled = (): ChainResult => ({ handled: false })
