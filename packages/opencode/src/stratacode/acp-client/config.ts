// stratacode_change - new file
import { Schema } from "effect"

export const ConfigACPProvider = Schema.Struct({
  name: Schema.optional(Schema.String).annotate({ description: "Display name" }),
  command: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Command to execute the ACP provider",
  }),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Environment variables for the ACP provider",
  }),
  cwd: Schema.optional(Schema.String).annotate({ description: "Working directory for the ACP provider" }),
  transport: Schema.optional(Schema.Union([Schema.Literal("stdio"), Schema.Literal("http")])).annotate({
    description: "Transport type (stdio or http)",
  }),
  url: Schema.optional(Schema.String).annotate({ description: "URL for HTTP transport" }),
  trusted: Schema.optional(Schema.Boolean).annotate({ description: "Auto-approve file operations from this provider" }),
  model: Schema.optional(Schema.String).annotate({ description: "Selected model ID for this provider" }),
  enabled: Schema.optional(Schema.Boolean).annotate({ description: "Whether this provider is enabled" }),
  predefined: Schema.optional(Schema.Boolean).annotate({ description: "Whether this provider comes from the built-in registry" }),
})

export type ConfigACPProvider = Schema.Schema.Type<typeof ConfigACPProvider>

/** @deprecated Use ConfigACPProvider */
export { ConfigACPProvider as ConfigACPAgent }
