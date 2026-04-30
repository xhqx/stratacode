// stratacode_change - new file
import { Hono } from "hono"
import { lazy } from "@/util/lazy"
import { Effect } from "effect"
import { RepoMap } from "../../repomap"
import { Ripgrep } from "@/file/ripgrep"
import { Instance } from "@/project/instance"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { errors } from "../../../server/error"

// We need the same layers that Ripgrep uses
const layer = Ripgrep.defaultLayer

export const RepoMapRoutes = lazy(() => {
  return new Hono()
    .post(
      "/generate",
      describeRoute({
        summary: "Generate repository map",
        description: "Generate a token-budgeted repository map of the workspace",
        operationId: "repoMap.generate",
        responses: {
          200: {
            description: "Repository map generated successfully",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    map: z.string(),
                    stats: z.object({
                      files: z.number(),
                      symbols: z.number(),
                      chars: z.number(),
                      budget: z.number(),
                    }),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          budget: z.number().optional().meta({ description: "Character budget limit" }),
          mentioned: z.array(z.string()).optional().meta({ description: "Boost files that are mentioned" }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const cwd = Instance.directory

        const program = Effect.gen(function* () {
          return yield* RepoMap.generate({
            cwd,
            budget: body.budget,
            mentioned: body.mentioned,
          })
        })

        const result = await Effect.runPromise(Effect.provide(program, layer))
        return c.json(result)
      },
    )
    .post(
      "/invalidate",
      describeRoute({
        summary: "Invalidate repository map cache",
        description: "Clears the parsed tag cache for specific files, or the entire cache if omitted.",
        operationId: "repoMap.invalidate",
        responses: {
          200: {
            description: "Cache invalidated",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          files: z.array(z.string()).optional().meta({ description: "Specific files to invalidate" }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        await Effect.runPromise(RepoMap.invalidate(body.files))
        return c.json({ success: true })
      },
    )
})
