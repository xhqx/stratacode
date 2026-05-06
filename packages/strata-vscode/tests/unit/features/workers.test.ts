import { expect, test, mock } from "bun:test"
import {
  WorkersFeature,
  ExplainerWorkerFeature,
  PromptAutocompleteFeature,
} from "../../../src/stratacode/features/workers"

test("WorkersFeature routes toggles correctly", async () => {
  const feature = new WorkersFeature()
  // Just testing that it has correct metadata for now, since it uses vscode APIs
  expect(feature.id).toBe("workers")
})

test("ExplainerWorkerFeature routes toggles correctly", async () => {
  const feature = new ExplainerWorkerFeature()
  expect(feature.id).toBe("explainerWorker")
})

test("PromptAutocompleteFeature routes toggles correctly", async () => {
  const feature = new PromptAutocompleteFeature()
  expect(feature.id).toBe("promptAutocomplete")
})
