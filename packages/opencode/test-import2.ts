import { STRATA_BUNDLED_PROVIDERS } from "./src/stratacode/provider/provider"

async function run() {
  const loader = STRATA_BUNDLED_PROVIDERS["@stratacode/strata-gateway"]
  console.log("loader is:", typeof loader)
  if (loader) {
    const factory = await loader()
    console.log("factory is:", typeof factory)
  }
}

run()
