// stratacode_change - new file
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { fetchSessionContext } from "../../session-context"
import { Config } from "../../../config"
import { lazy } from "../../../util/lazy"
import { errors } from "../../../server/error"

export const SessionContextRoutes = lazy(() =>
  new Hono().post(
    "/",
    describeRoute({
      summary: "Get session context",
      description: "Fetch a summarized digest of recent conversation sessions for the given directory.",
      operationId: "sessionContext.create",
      responses: {
        200: {
          description: "Session context summary",
          content: {
            "application/json": {
              schema: resolver(z.object({ context: z.string() })),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "json",
      z.object({
        directory: z.string().meta({ description: "Workspace/project directory to scope session context" }),
        limit: z.number().int().min(0).optional().meta({ description: "Override the configured session limit" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json")
      const config = await Config.get()
      const limit = body.limit ?? config.session_context?.limit ?? 5
      const context = limit > 0 ? await fetchSessionContext(body.directory, limit) : ""
      return c.json({ context })
    },
  ),
)
