import { createStrataClient } from "./packages/sdk/js/src/v2/client"

async function main() {
  const client = createStrataClient({
    baseUrl: "http://127.0.0.1:45321", // How to get the port?
    headers: {},
  })
}
