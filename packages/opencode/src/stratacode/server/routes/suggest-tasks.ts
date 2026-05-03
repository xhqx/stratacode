// stratacode_change - new file
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { suggestTasks } from "../../suggest-tasks"
import { Instance } from "../../../project/instance"
import { lazy } from "../../../util/lazy"
import { errors } from "../../../server/error"

export const SuggestTasksRoutes = lazy(() =>
  new Hono().post(
    "/",
    describeRoute({
      summary: "Generate task suggestions",
      description: "Generate 2-3 contextual next-task proposals using background summarizer context.",
      operationId: "suggestTasks.generate",
      responses: {
        200: {
          description: "Task suggestions",
          content: {
            "application/json": {
              schema: resolver(z.object({ suggestions: z.array(z.string()) })),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "json",
      z.object({
        directory: z.string().optional().meta({ description: "Workspace/project directory" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json")
      const dir = body.directory ?? Instance.directory
      const result = await suggestTasks(dir)
      return c.json({ suggestions: result.suggestions })
    },
  ),
)
