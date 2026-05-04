import type { PendingRequest } from "../types"
import { calcDebounceDelay } from "./inline-utils"

const INITIAL_DEBOUNCE_DELAY_MS = 300
const LATENCY_SAMPLE_SIZE = 10

export class AutocompleteRequestScheduler {
  private pendingRequests: PendingRequest[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private debouncedPendingRequest: PendingRequest | null = null
  private debounceDelayMs: number = INITIAL_DEBOUNCE_DELAY_MS
  private latencyHistory: number[] = []
  private isFirstCall: boolean = true

  public recordLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs)
    if (this.latencyHistory.length > LATENCY_SAMPLE_SIZE) {
      this.latencyHistory.shift()
      this.debounceDelayMs = calcDebounceDelay(this.latencyHistory)
    }
  }

  public schedule(prefix: string, suffix: string, execute: () => Promise<void>): Promise<void> {
    const coveringRequest = this.findCoveringPendingRequest(prefix, suffix)
    if (coveringRequest) {
      return coveringRequest.promise
    }

    if (this.isFirstCall && this.debounceTimer === null) {
      this.isFirstCall = false
      const promise = execute()
      const leading: PendingRequest = { prefix, suffix, promise }
      promise.finally(() => this.removePendingRequest(leading))
      this.pendingRequests.push(leading)
      return promise
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      this.settleDebouncedPendingRequest()
    }

    const pendingRequest: PendingRequest = {
      prefix,
      suffix,
      promise: null!,
    }

    const requestPromise = new Promise<void>((resolve) => {
      pendingRequest.resolve = resolve
      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null
        this.debouncedPendingRequest = null
        this.isFirstCall = true
        try {
          await execute()
        } finally {
          this.removePendingRequest(pendingRequest)
          resolve()
        }
      }, this.debounceDelayMs)
    })

    pendingRequest.promise = requestPromise
    this.debouncedPendingRequest = pendingRequest
    this.pendingRequests.push(pendingRequest)

    return requestPromise
  }

  private findCoveringPendingRequest(prefix: string, suffix: string): PendingRequest | null {
    for (const pendingRequest of this.pendingRequests) {
      if (suffix !== pendingRequest.suffix) continue
      if (prefix.startsWith(pendingRequest.prefix)) return pendingRequest
    }
    return null
  }

  private removePendingRequest(request: PendingRequest): void {
    const index = this.pendingRequests.indexOf(request)
    if (index !== -1) {
      this.pendingRequests.splice(index, 1)
    }
  }

  private settleDebouncedPendingRequest(): void {
    const pending = this.debouncedPendingRequest
    if (!pending) return

    this.removePendingRequest(pending)
    pending.resolve?.()
    this.debouncedPendingRequest = null
  }

  public dispose(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.settleDebouncedPendingRequest()
    this.pendingRequests.length = 0
  }
}
