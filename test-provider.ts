import { Effect } from "effect"
import { Provider } from "./packages/opencode/src/provider"
import * as Config from "./packages/opencode/src/config/config"

async function run() {
  await Config.get()
  const defaultModel = await Provider.defaultModel()
  console.log("defaultModel", defaultModel)
  
  try {
    const model = await Provider.getSmallModel(defaultModel.providerID)
    console.log("small model", model)
    const lang = await Provider.getLanguage(model!)
    console.log("lang", typeof lang)
  } catch (err) {
    console.error("ProviderInitError", err)
  }
}
run()
