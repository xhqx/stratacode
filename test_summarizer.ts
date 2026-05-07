import { summarizerWorker } from "./packages/opencode/src/stratacode/worker/summarizer"
import { Instance } from "./packages/opencode/src/project/instance"

async function main() {
  try {
    await Instance.provide({
      directory: process.cwd(),
      fn: () => summarizerWorker(process.cwd(), {})
    })
  } catch(e) {
    console.error(e)
  }
}
main()
