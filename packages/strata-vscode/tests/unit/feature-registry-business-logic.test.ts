import { describe, expect, test, mock, beforeEach } from "bun:test"

// Mock the VS Code API
const mockWorkspaceConfig = {
  update: mock(),
  get: mock(),
  inspect: mock(() => ({ globalValue: undefined, workspaceValue: undefined })),
}

mock.module("vscode", () => ({
  workspace: {
    getConfiguration: () => mockWorkspaceConfig,
    onDidSaveTextDocument: mock(),
    onDidChangeConfiguration: mock(),
    onDidRenameFiles: mock(),
    onDidDeleteFiles: mock(),
    onDidCreateFiles: mock(),
  },
  ConfigurationTarget: {
    Global: 1,
  },
  window: {
    showWarningMessage: mock(),
    onDidChangeActiveTextEditor: mock(),
    onDidChangeTextEditorSelection: mock(),
    createStatusBarItem: mock(() => ({
      text: "",
      show: mock(),
      hide: mock(),
      dispose: mock(),
    })),
  },
  EventEmitter: class {
    event = mock()
    fire = mock()
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
}))

// Mock the SDK
const mockClient = {
  global: {
    config: {
      update: mock(),
    },
  },
}

// We import after mocking
import { StrataProvider } from "../../src/StrataProvider"
import { MANIFEST } from "../../src/stratacode/feature-manifest"

describe("Feature Registry Business Logic (StrataProvider Configuration Bridges)", () => {
  let provider: any

  beforeEach(() => {
    mockWorkspaceConfig.update.mockClear()
    mockWorkspaceConfig.get.mockClear()
    mockClient.global.config.update.mockClear()

    // Instantiate with dummy dependencies
    provider = new StrataProvider(
      {} as any, // extensionUri
      { getClient: () => mockClient } as any, // connectionService
      {} as any, // extensionContext
    )
    provider.postMessage = mock()
    // We already mock client through the connectionService injected into the constructor:
    // { getClient: () => mockClient }
  })

  test("features.workers bridges to workers.enabled", async () => {
    await provider.handleUpdateSetting("features.workers", true)

    // First update is the standard settings map update
    expect(mockWorkspaceConfig.update).toHaveBeenCalledWith("workers", true, 1)
    // Second update is the bridged update for the runtime agent config
    expect(mockWorkspaceConfig.update).toHaveBeenCalledWith("workers.enabled", true, 1)
  })

  test("features.explainerWorker bridges to workers.autoExplain when disabled", async () => {
    await provider.handleUpdateSetting("features.explainerWorker", false)
    expect(mockWorkspaceConfig.update).toHaveBeenCalledWith("workers.autoExplain", false, 1)
  })

  test("features.browserAutomation bridges to browserAutomation.enabled", async () => {
    await provider.handleUpdateSetting("features.browserAutomation", true)
    expect(mockWorkspaceConfig.update).toHaveBeenCalledWith("enabled", true, 1)
  })

  test("features.promptAutocomplete bridges to enableChatAutocomplete", async () => {
    await provider.handleUpdateSetting("features.promptAutocomplete", true)
    expect(mockWorkspaceConfig.update).toHaveBeenCalledWith("enableChatAutocomplete", true, 1)
  })

  test("features.batchTool bridges to experimental.batch_tool via client config", async () => {
    await provider.handleUpdateSetting("features.batchTool", true)
    expect(mockClient.global.config.update).toHaveBeenCalledWith({
      config: { experimental: { batch_tool: true } },
    })
  })

  test("features.formatter bridges to formatter object via client config", async () => {
    await provider.handleUpdateSetting("features.formatter", true)
    expect(mockClient.global.config.update).toHaveBeenCalledWith({
      config: { formatter: {} },
    })

    await provider.handleUpdateSetting("features.formatter", false)
    expect(mockClient.global.config.update).toHaveBeenCalledWith({
      config: { formatter: false },
    })
  })

  test("features.autoretries bridges to retry.enabled via client config", async () => {
    await provider.handleUpdateSetting("features.autoretries", true)
    expect(mockClient.global.config.update).toHaveBeenCalledWith({
      config: { retry: { enabled: true } },
    })
  })

  test("Feature updates correctly broadcast to webview", async () => {
    await provider.handleUpdateSetting("features.batchTool", true)
    expect(provider.postMessage).toHaveBeenCalled()
    const callArgs = provider.postMessage.mock.calls[0][0]
    expect(callArgs.type).toBe("extensionFeaturesLoaded")
  })
})
