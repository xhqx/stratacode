import type { StrataClient } from "@stratacode/sdk/v2/client"

export async function abortSession(input: { client: StrataClient; sessionID: string; dir: string }) {
  await input.client.session.abort({ sessionID: input.sessionID, directory: input.dir }, { throwOnError: true })
}
