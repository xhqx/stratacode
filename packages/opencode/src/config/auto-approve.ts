// stratacode_change - new file
import { Schema } from "effect"

export const Info = Schema.Struct({
  timeout: Schema.optional(Schema.Number).annotate({
    description: "Auto-approve permissions after N seconds of inaction (0 = disabled)",
  }),
  question_timeout: Schema.optional(Schema.Number).annotate({
    description: "Auto-answer questions after N seconds (0 = disabled, selects first option)",
  }),
})
