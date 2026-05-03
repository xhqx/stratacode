// stratacode_change - new file
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { chatAutocomplete } from "../../chat-autocomplete"
import { Instance } from "../../../project/instance"
import { lazy } from "../../../util/lazy"
import { errors } from "../../../server/error"

export const ChatAutocompleteRoutes = lazy(() =>
  new Hono().post(
    "/",
    describeRoute({
      summary: "Complete a chat prompt",
      description: "Generate a ghost-text completion for the user's partial chat prompt using project context.",
      operationId: "chatAutocomplete.complete",
      responses: {
        200: {
          description: "Completion text",
          content: {
            "application/json": {
              schema: resolver(z.object({ text: z.string() })),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "json",
      z.object({
        text: z.string().meta({ description: "Partial chat prompt to complete" }),
        directory: z.string().optional().meta({ description: "Workspace/project directory" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json")
      const dir = body.directory ?? Instance.directory
      const text = await chatAutocomplete(body.text, dir)
      return c.json({ text })
    },
  ),
)
