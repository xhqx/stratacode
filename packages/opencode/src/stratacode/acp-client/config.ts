// stratacode_change - new file
import { Schema } from "effect"

export const ConfigACPAgent = Schema.Struct({
  name: Schema.optional(Schema.String).annotate({ description: "Display name" }),
  command: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({ description: "Command to execute the ACP agent" }),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({ description: "Environment variables for the ACP agent" }),
  cwd: Schema.optional(Schema.String).annotate({ description: "Working directory for the ACP agent" }),
  transport: Schema.optional(Schema.Union([Schema.Literal("stdio"), Schema.Literal("http")])).annotate({ description: "Transport type (stdio or http)" }),
  url: Schema.optional(Schema.String).annotate({ description: "URL for HTTP transport" }),
  trusted: Schema.optional(Schema.Boolean).annotate({ description: "Auto-approve file operations from this agent" })
})

export type ConfigACPAgent = Schema.Schema.Type<typeof ConfigACPAgent>
