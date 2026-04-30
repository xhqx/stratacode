import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { lazy } from "@/util/lazy"
import { errors } from "@/server/error"
import { Service as MemoryService } from "./memory"
import { jsonRequest } from "@/server/routes/instance/trace"

const MemoryEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
})

export const MemoryRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List memory entries",
        description: "List all semantic project memory entries.",
        operationId: "memory.list",
        responses: {
          200: {
            description: "List of entries",
            content: {
              "application/json": {
                schema: resolver(MemoryEntrySchema.array()),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("MemoryRoutes.list", c, function* () {
          const service = yield* MemoryService
          return yield* service.list()
        }),
    )
    .post(
      "/",
      describeRoute({
        summary: "Add memory entry",
        description: "Add a new semantic project memory entry.",
        operationId: "memory.add",
        responses: {
          200: {
            description: "Entry added",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          id: z.string(),
          title: z.string(),
          content: z.string(),
        }),
      ),
      async (c) =>
        jsonRequest("MemoryRoutes.add", c, function* () {
          const body = c.req.valid("json")
          const service = yield* MemoryService
          yield* service.add(body.id, body.title, body.content)
          return true
        }),
    )
    .post(
      "/delete",
      describeRoute({
        summary: "Delete memory entry",
        description: "Delete a memory entry by ID.",
        operationId: "memory.delete",
        responses: {
          200: {
            description: "Entry deleted",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          id: z.string(),
        }),
      ),
      async (c) =>
        jsonRequest("MemoryRoutes.delete", c, function* () {
          const body = c.req.valid("json")
          const service = yield* MemoryService
          yield* service.delete(body.id)
          return true
        }),
    ),
)
