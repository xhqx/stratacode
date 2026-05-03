// stratacode_change - new file
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { enhancePrompt } from "@/stratacode/enhance-prompt"
import { lazy } from "@/util/lazy"
import { errors } from "../../error"

export const EnhancePromptRoutes = lazy(() =>
  new Hono().post(
    "/",
    describeRoute({
      summary: "Enhance prompt",
      description: "Rewrite a user's draft prompt into a clearer, more specific, and more effective prompt.",
      operationId: "enhancePrompt.enhance",
      responses: {
        200: {
          description: "Enhanced prompt text",
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
        text: z.string().min(1).meta({ description: "The user's draft prompt to enhance" }),
        directory: z // stratacode_change
          .string()
          .optional()
          .meta({ description: "Workspace directory for session context enrichment" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json")
      const result = await enhancePrompt(body.text, body.directory) // stratacode_change
      return c.json({ text: result })
    },
  ),
)
