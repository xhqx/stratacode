import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "@/config"
import { Provider } from "@/provider"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"
// stratacode_change start
import { fetchDefaultModel } from "@stratacode/strata-gateway"
import { Auth } from "@/auth"
import { Effect } from "effect"
import { ModelID, ProviderID } from "@/provider/schema"
// stratacode_change end

export const ConfigRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get configuration",
        description: "Retrieve the current OpenCode configuration settings and preferences.",
        operationId: "config.get",
        responses: {
          200: {
            description: "Get config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ConfigRoutes.get", c, function* () {
          const cfg = yield* Config.Service
          return yield* cfg.get()
        }),
    )
    .patch(
      "/",
      describeRoute({
        summary: "Update configuration",
        description: "Update OpenCode configuration settings and preferences.",
        operationId: "config.update",
        responses: {
          200: {
            description: "Successfully updated config",
            content: {
              "application/json": {
                schema: resolver(Config.Info.zod),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info.zod),
      async (c) =>
        jsonRequest("ConfigRoutes.update", c, function* () {
          const config = c.req.valid("json")
          const cfg = yield* Config.Service
          yield* cfg.update(config)
          return config
        }),
    )
    // stratacode_change start
    .get(
      "/warnings",
      describeRoute({
        summary: "Get config warnings",
        description: "Get warnings generated during config loading (e.g., invalid JSON, schema errors).",
        operationId: "config.warnings",
        responses: {
          200: {
            description: "Config warnings",
            content: {
              "application/json": {
                schema: resolver(Config.Warning.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.warnings())
      },
    )
    // stratacode_change end
    .get(
      "/providers",
      describeRoute({
        summary: "List config providers",
        description: "Get a list of all configured AI providers and their default models.",
        operationId: "config.providers",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(Provider.ConfigProvidersResult.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ConfigRoutes.providers", c, function* () {
          const svc = yield* Provider.Service
          const providers = yield* svc.list()
          const defaults = Provider.defaultModelIDs(providers)

          // stratacode_change start - Fetch default model from Strata API when the strata provider is available.
          // Only call the Strata API when the strata provider is actually available.
          // This prevents unnecessary network calls for teams using only their
          // own providers (e.g. LiteLLM) via enabled_providers config.
          if (providers[ProviderID.strata]) {
            const auth = yield* Auth.Service
            const strataAuth = yield* auth.get("strata")
            const token = strataAuth?.type === "oauth" ? strataAuth.access : strataAuth?.key
            const organizationId = strataAuth?.type === "oauth" ? strataAuth.accountId : undefined
            const strataApiDefault = yield* Effect.promise(() => fetchDefaultModel(token, organizationId))
            if (strataApiDefault && providers[ProviderID.strata]?.models[strataApiDefault]) {
              defaults[ProviderID.strata] = ModelID.make(strataApiDefault)
            }
          }
          // stratacode_change end

          return {
            providers: Object.values(providers),
            default: defaults, // stratacode_change
          }
        }),
    ),
)
