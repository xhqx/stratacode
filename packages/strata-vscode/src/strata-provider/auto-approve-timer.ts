import * as vscode from "vscode"
import { StrataProvider } from "../StrataProvider"

export class AutoApproveTimer {
  private timer: NodeJS.Timeout | null = null
  private currentRequest: string | null = null
  private timeLeft: number = 0
  private updateInterval: NodeJS.Timeout | null = null

  constructor(private provider: StrataProvider) {}

  startTimer(requestId: string, timeoutSeconds: number, onApprove: () => void) {
    this.clearTimer()
    this.currentRequest = requestId
    this.timeLeft = timeoutSeconds

    // Send initial timer state
    this.provider.postMessage({
      type: "autoApproveTimerStarted",
      requestId,
      timeLeft: this.timeLeft,
    })

    this.updateInterval = setInterval(() => {
      this.timeLeft -= 1
      if (this.timeLeft > 0) {
        this.provider.postMessage({
          type: "autoApproveTimerUpdated",
          requestId: this.currentRequest!,
          timeLeft: this.timeLeft,
        })
      }
    }, 1000)

    this.timer = setTimeout(() => {
      this.clearTimer()
      this.provider.postMessage({
        type: "autoApproveTimerFired",
        requestId,
      })
      onApprove()
    }, timeoutSeconds * 1000)
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    if (this.currentRequest) {
      this.provider.postMessage({
        type: "autoApproveTimerCancelled",
        requestId: this.currentRequest,
      })
      this.currentRequest = null
    }
  }

  isTimerRunningFor(requestId: string): boolean {
    return this.currentRequest === requestId
  }
}
