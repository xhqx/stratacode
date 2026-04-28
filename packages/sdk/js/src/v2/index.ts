export * from "./client.js"
export * from "./server.js"

import { createStrataClient } from "./client.js"
import { createStrataServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createStrata(options?: ServerOptions) {
  const server = await createStrataServer({
    ...options,
  })

  const client = createStrataClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
