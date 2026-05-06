// stratacode_change - new file
import { Hono } from "hono"
import { lazy } from "@/util/lazy"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { errors } from "../../../server/error"
import { Instance } from "@/project/instance"
import { DocManifestService } from "../../worker/doc-manifest"
import { dispatch } from "../../worker/worker"
import path from "path"
import fs from "fs"

const DocPageMetaSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  status: z.enum(["pending", "generating", "ready", "stale", "error"]),
  symbols: z.number(),
  generated: z.string(),
  hash: z.string(),
  error: z.string().optional(),
})

const DocManifestSchema = z.object({
  version: z.number(),
  generated: z.string(),
  pages: z.array(DocPageMetaSchema),
})

export const DocsRoutes = lazy(() => {
  return new Hono()
    .get(
      "/manifest",
      describeRoute({
        summary: "Get documents manifest",
        description: "Returns the current documentation manifest including all generated pages and their statuses.",
        operationId: "docs.manifest",
        responses: {
          200: {
            description: "Manifest retrieved successfully",
            content: {
              "application/json": {
                schema: resolver(DocManifestSchema),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const cwd = Instance.directory
        const manifest = await DocManifestService.read(cwd)
        return c.json(manifest)
      },
    )
    .get(
      "/page/:id",
      describeRoute({
        summary: "Get document page content",
        description: "Returns the generated Markdown content for a specific document page.",
        operationId: "docs.page",
        responses: {
          200: {
            description: "Page content retrieved",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    content: z.string(),
                    meta: DocPageMetaSchema,
                  }),
                ),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const cwd = Instance.directory
        const manifest = await DocManifestService.read(cwd)
        const meta = manifest.pages.find((p) => p.id === id)

        if (!meta) {
          return c.json({ error: "Page not found" }, 404)
        }

        try {
          const content = await fs.promises.readFile(path.join(cwd, ".stratacode", "docs", `${id}.md`), "utf-8")
          return c.json({ content, meta })
        } catch {
          return c.json({ error: "Page content not found on disk" }, 404)
        }
      },
    )
    .post(
      "/generate",
      describeRoute({
        summary: "Generate documentation",
        description: "Triggers background generation of documentation for all files.",
        operationId: "docs.generate",
        responses: {
          200: {
            description: "Generation started",
            content: {
              "application/json": {
                schema: resolver(z.object({ status: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        const cwd = Instance.directory
        await dispatch(cwd, "doc_worker", { force: false })
        return c.json({ status: "started" })
      },
    )
    .post(
      "/regenerate/:id",
      describeRoute({
        summary: "Regenerate document page",
        description: "Triggers background regeneration of documentation for a specific file.",
        operationId: "docs.regenerate",
        responses: {
          200: {
            description: "Regeneration started",
            content: {
              "application/json": {
                schema: resolver(z.object({ status: z.string() })),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const cwd = Instance.directory
        const manifest = await DocManifestService.read(cwd)
        const meta = manifest.pages.find((p) => p.id === id)

        if (!meta) {
          return c.json({ error: "Page not found" }, 404)
        }

        await dispatch(cwd, "doc_worker", { files: [meta.path], force: true })
        return c.json({ status: "started" })
      },
    )
})
