import { lazy } from "@/util/lazy"
import { StrataIndexing } from "@/stratacode/indexing"
import { createIndexingRoutes } from "@stratacode/strata-indexing/server"

export const IndexingRoutes = lazy(() =>
  createIndexingRoutes({
    current: () => StrataIndexing.current(),
  }),
)
