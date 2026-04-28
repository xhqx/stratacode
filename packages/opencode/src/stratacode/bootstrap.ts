import { StrataSessions } from "@/strata-sessions/strata-sessions"
import { StrataIndexing } from "@/stratacode/indexing"

export namespace StratacodeBootstrap {
  export async function init() {
    await Promise.all([StrataSessions.init(), StrataIndexing.init()])
  }
}
