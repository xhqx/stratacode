import type { StrataClient } from "@stratacode/sdk/v2/client"
import { Logger } from "../stratacode/logger"
import { retry } from "../services/cli-backend/retry"

export interface FetchContext {
  client: StrataClient | null
  dir: string
  postMessage: (msg: Record<string, unknown>) => void
}

/**
 * Creates a reusable fetch-and-cache handler.
 * It encapsulates the pattern of:
 * 1. If client is not available, push cached data if it exists.
 * 2. Fetch data from backend with retry.
 * 3. Transform the data into a webview message.
 * 4. Cache the message and send it.
 */
export function createFetchAndSend<T>(opts: {
  label: string
  fetch: (client: StrataClient, dir: string) => Promise<T>
  transform: (data: T) => Record<string, unknown>
}) {
  let cachedMessage: Record<string, unknown> | null = null

  const execute = async (ctx: FetchContext): Promise<void> => {
    if (!ctx.client) {
      if (cachedMessage) {
        ctx.postMessage(cachedMessage)
      }
      return
    }

    try {
      const data = await retry(() => opts.fetch(ctx.client!, ctx.dir))
      const message = opts.transform(data)
      cachedMessage = message
      ctx.postMessage(message)
    } catch (error) {
      Logger.error("StrataProvider", `Failed to fetch ${opts.label}:`, error)
    }
  }

  const invalidate = (): void => {
    cachedMessage = null
  }

  const get = (): Record<string, unknown> | null => {
    return cachedMessage
  }

  const set = (message: Record<string, unknown> | null): void => {
    cachedMessage = message
  }

  return { execute, invalidate, get, set }
}
