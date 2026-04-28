import type { StrataClient } from "@stratacode/sdk/v2/client"

export async function hasGit(client: StrataClient, directory: string): Promise<boolean> {
  return client.project
    .current({ directory })
    .then((r) => r.data?.vcs === "git")
    .catch(() => false)
}
