import { describe, expect, test, mock } from "bun:test"

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
  ConfigurationTarget: { Global: 1 },
  window: {
    showWarningMessage: mock(),
    onDidChangeActiveTextEditor: mock(),
    onDidChangeTextEditorSelection: mock(),
    createStatusBarItem: mock(() => ({ text: "", show: mock(), hide: mock(), dispose: mock() })),
  },
  EventEmitter: class {
    event = mock()
    fire = mock()
  },
  Uri: { file: (path: string) => ({ fsPath: path }) },
}))

import { StrataProvider } from "./src/StrataProvider"

const mockClient = { global: { config: { update: mock() } } }

const provider = new StrataProvider(
  {} as any,
  "" as any,
  {} as any,
  { getClient: () => mockClient } as any,
  {} as any,
  {} as any,
)
console.log(provider.client === mockClient)
