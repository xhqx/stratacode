import { StrataSessions } from "@/strata-sessions/strata-sessions"
import { StrataIndexing } from "@/stratacode/indexing"
import { startSummarizerPolling } from "./worker/summarizer"
import { Instance } from "@/project/instance"

export namespace StratacodeBootstrap {
  export async function init() {
    await Promise.all([StrataSessions.init(), StrataIndexing.init()])
    await startSummarizerPolling(Instance.directory)
  }
}
