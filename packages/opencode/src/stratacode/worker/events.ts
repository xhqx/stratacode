// stratacode_change - new file
import { BusEvent } from "@/bus/bus-event"
import z from "zod"

export const Started = BusEvent.define(
  "worker.started",
  z.object({
    id: z.string(),
    worker: z.string(),
    file: z.string().optional(),
  }),
)

export const Completed = BusEvent.define(
  "worker.completed",
  z.object({
    id: z.string(),
    worker: z.string(),
    duration: z.number(),
    result: z.any().optional(), // For returning explainer results or other payload
  }),
)

export const Failed = BusEvent.define(
  "worker.failed",
  z.object({
    id: z.string(),
    worker: z.string(),
    error: z.string(),
  }),
)
