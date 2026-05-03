// stratacode_change - new file
import { Hono } from "hono"
import z from "zod"
import { describeRoute, validator, resolver } from "hono-openapi"
import { dispatch } from "../../worker/worker"
import { isDenied } from "../../worker/deny"
import { lazy } from "../../../util/lazy"
import { ContextMapService } from "../../worker/context-map"
import { Instance } from "../../../project/instance"

export const TriggerSchema = z.object({
  cwd: z.string(),
  files: z.array(z.string()),
  autoExplain: z.boolean().optional(),
})

const ContextSummarySchema = z.object({
  summary: z.string().nullable(),
})

export const WorkerRoutes = lazy(() =>
  new Hono()
    .get(
      "/context",
      describeRoute({
        summary: "Get summarizer context",
        description: "Retrieve the latest background summarizer context summary",
        tags: ["Worker"],
        responses: {
          200: {
            description: "Summarizer context summary",
            content: {
              "application/json": {
                schema: resolver(ContextSummarySchema),
              },
            },
          },
        },
      }),
      async (c) => {
        const map = await ContextMapService.read(Instance.directory)
        return c.json({ summary: map.summary ?? null })
      },
    )
    .post(
      "/trigger",
      describeRoute({
        summary: "Trigger background context workers",
        description: "Dispatch workers for changed files, applying debounce and filtering",
        tags: ["Worker"],
        responses: {
          200: {
            description: "Workers dispatched",
          },
        },
      }),
      validator("json", TriggerSchema),
      async (c) => {
        const { cwd, files, autoExplain } = c.req.valid("json")

        const { Config } = await import("@/config")
        const cfg = await Config.get()

        // Filter denied files
        const allowedFiles = files.filter((f) => !isDenied(f))
        if (allowedFiles.length === 0) {
          return c.json({ success: true, message: "all files denied" })
        }

        // Fire summarize worker (processes all allowed files at once)
        if (cfg.workers?.summarizer !== false) {
          dispatch(cwd, "summarizer_worker", { files: allowedFiles })
        }

        // Fire review and explainer workers per file
        for (const file of allowedFiles) {
          if (cfg.workers?.review !== false) {
            dispatch(cwd, "review_worker", { file })
          }
          if (autoExplain || cfg.workers?.auto_explain) {
            dispatch(cwd, "explainer_worker", { file })
          }
        }

        return c.json({ success: true })
      },
    ),
)
