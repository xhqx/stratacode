import { describe, it, expect, vi, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { AutocompleteEngine } from "../AutocompleteEngine"
import { AutocompleteSettingsManager } from "../../AutocompleteSettingsManager"
import { MockTextDocument } from "../../../mocking/MockTextDocument"

vi.mock("vscode", () => {
  return {
    InlineCompletionTriggerKind: {
      Invoke: 0,
      Automatic: 1,
    },
    InlineCompletionItem: class MockInlineCompletionItem {
      insertText: string | { value: string }
      range?: { start: { line: number; character: number }; end: { line: number; character: number } }
      command?: { command: string; title: string }

      constructor(
        insertText: string | { value: string },
        range?: { start: { line: number; character: number }; end: { line: number; character: number } },
        command?: { command: string; title: string },
      ) {
        this.insertText = insertText
        this.range = range
        this.command = command
      }
    },
    window: {
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      workspaceFolders: [],
    },
  }
})

vi.mock("../../AutocompleteSettingsManager", () => {
  return {
    AutocompleteSettingsManager: {
      getInstance: vi.fn(() => ({
        getSettings: vi.fn(() => ({
          enabled: true,
          showOnlyFirstLine: false,
          maxLines: 10,
        })),
      })),
    },
  }
})

vi.mock("../../shims/FileIgnoreController", () => {
  return {
    FileIgnoreController: class MockFileIgnoreController {
      initialize = vi.fn().mockResolvedValue(undefined)
      validateAccess = vi.fn().mockReturnValue(true) // Always allow
      dispose = vi.fn()
    },
  }
})

vi.mock("../FillInTheMiddle", () => {
  return {
    FimPromptBuilder: class MockFimPromptBuilder {
      getFimPrompts = vi.fn().mockResolvedValue({
        formattedPrefix: "const x = 1",
        prunedSuffix: "",
        autocompleteInput: {},
      })
      getFromFIM = vi.fn().mockImplementation(async (client, prompt, processSuggestion) => {
        const suggestion = processSuggestion("console.log('test');")
        return {
          suggestion,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
        }
      })
    },
  }
})

describe("AutocompleteEngine", () => {
  let engine: AutocompleteEngine
  let mockBackendClient: any
  let mockTelemetry: any
  let mockSnoozeManager: any

  beforeEach(() => {
    mockBackendClient = {
      isConfigured: vi.fn().mockResolvedValue(true),
      getFimModel: vi.fn().mockReturnValue({}),
      generateFimResponse: vi.fn().mockResolvedValue({
        choices: [{ text: "console.log('test');" }],
      }),
      getModelName: vi.fn().mockReturnValue("mock-model"),
      getProviderDisplayName: vi.fn().mockReturnValue("Mock Provider"),
      hasValidCredentials: vi.fn().mockReturnValue(true),
    }

    mockTelemetry = {
      startTracking: vi.fn().mockReturnValue({ id: "test-id" }),
      recordShown: vi.fn(),
      recordAccepted: vi.fn(),
      recordRejected: vi.fn(),
      recordError: vi.fn(),
      captureSuggestionRequested: vi.fn(),
      captureCacheHit: vi.fn(),
      captureLlmSuggestionReturned: vi.fn(),
      captureLlmRequestCompleted: vi.fn(),
      captureLlmRequestFailed: vi.fn(),
      captureSuggestionFiltered: vi.fn(),
      startVisibilityTracking: vi.fn(),
      cancelVisibilityTracking: vi.fn(),
    }

    engine = new AutocompleteEngine(
      {} as vscode.ExtensionContext,
      mockBackendClient,
      vi.fn(),
      "/test/workspace",
      mockTelemetry,
      vi.fn(),
    )
  })

  it("should initialize successfully", () => {
    expect(engine).toBeDefined()
  })

  it("should process requests correctly", async () => {
    const document = new MockTextDocument({ fsPath: __filename } as vscode.Uri, "const x = 1\n")
    const position = new vscode.Position(0, 11)

    const result = await engine.getCompletion(document, position)

    // We mocked the backend to return "console.log('test');"
    // So the result should be the string
    expect(result).toBeDefined()
    expect(typeof result).toBe("string")
    expect(result).toBe("console.log('test');")
  })
})
