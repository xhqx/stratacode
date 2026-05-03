import * as vscode from "vscode"
import { ContextRetrievalService } from "../continuedev/core/autocomplete/context/ContextRetrievalService"
import { VsCodeIde } from "../continuedev/core/vscode-test-harness/src/VSCodeIde"
import { AutocompleteInput } from "../types"
import type { AutocompleteInput as ContinueAutocompleteInput } from "../continuedev/core/autocomplete/util/types"
import { HelperVars } from "../continuedev/core/autocomplete/util/HelperVars"
import { getAllSnippetsWithoutRace } from "../continuedev/core/autocomplete/snippets/getAllSnippets"
import { getDefinitionsFromLsp } from "../continuedev/core/vscode-test-harness/src/autocomplete/lsp"
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../continuedev/core/util/parameters"
import { getSnippets } from "../continuedev/core/autocomplete/templating/filtering"
import { AutocompleteBackendClient } from "../AutocompleteBackendClient"
import { FileIgnoreController } from "../shims/FileIgnoreController"
import { AutocompleteSnippet, AutocompleteSnippetType } from "../continuedev/core/autocomplete/types"

function uriToFsPath(filepath: string): string {
  if (filepath.startsWith("file://")) {
    return vscode.Uri.parse(filepath).fsPath
  }
  return filepath
}

function hasFilepath(snippet: AutocompleteSnippet): snippet is AutocompleteSnippet & { filepath?: string } {
  return snippet.type === AutocompleteSnippetType.Code || snippet.type === AutocompleteSnippetType.Static
}

async function filterSnippetsByAccess(
  snippets: AutocompleteSnippet[],
  ignoreController?: Promise<FileIgnoreController>,
): Promise<AutocompleteSnippet[]> {
  if (!ignoreController) {
    return snippets
  }

  try {
    // Try to get the controller, but don't wait too long
    const controller = await Promise.race([
      ignoreController,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ])

    if (!controller) {
      // If promise hasn't resolved yet, assume files are ignored (as per requirement)
      return snippets.filter((snippet) => {
        // Only keep snippets without file paths (Diff, Clipboard)
        return !hasFilepath(snippet) || !snippet.filepath
      })
    }

    return snippets.filter((snippet) => {
      if (hasFilepath(snippet) && snippet.filepath) {
        const fsPath = uriToFsPath(snippet.filepath)
        const hasAccess = controller.validateAccess(fsPath)
        return hasAccess
      }

      // Keep all other snippet types (Diff, Clipboard) that don't have file paths
      return true
    })
  } catch (error) {
    console.error("[AutocompleteContextProvider] Error filtering snippets by access:", error)
    // On error, be conservative and filter out file-based snippets
    return snippets.filter((snippet) => {
      return !hasFilepath(snippet) || !snippet.filepath
    })
  }
}

export async function getProcessedSnippets(
  autocompleteInput: AutocompleteInput,
  filepath: string,
  contextService: ContextRetrievalService,
  model: AutocompleteBackendClient,
  ide: VsCodeIde,
  ignoreController?: Promise<FileIgnoreController>,
): Promise<{
  filepathUri: string
  helper: HelperVars
  snippetsWithUris: AutocompleteSnippet[]
  workspaceDirs: string[]
}> {
  // Convert filepath to URI if it's not already one
  const filepathUri = filepath.startsWith("file://") ? filepath : vscode.Uri.file(filepath).toString()

  // Initialize import definitions cache
  // this looks like a race, but the contextService only prefetches data here; it's not a mode switch.
  // This odd-looking API seems to be an optimization that's used in continue but not (currently) in our codebase,
  // continue preloads the tree-sitter parse on text editor tab switch to reduce autocomplete latency.
  await contextService.initializeForFile(filepathUri)

  // Create helper with URI filepath
  const helperInput = {
    ...autocompleteInput,
    filepath: filepathUri,
  }

  const modelName = model.getModelName() ?? "codestral"
  const helper = await HelperVars.create(
    helperInput as ContinueAutocompleteInput,
    DEFAULT_AUTOCOMPLETE_OPTS,
    modelName,
    ide,
  )

  const snippetPayload = await getAllSnippetsWithoutRace({
    helper,
    ide,
    getDefinitionsFromLsp,
    contextRetrievalService: contextService,
  })

  const filteredSnippets = getSnippets(helper, snippetPayload)

  // Apply access filtering to remove snippets from blocked files
  const accessibleSnippets = await filterSnippetsByAccess(filteredSnippets, ignoreController)

  // Fetch the summarizer context in parallel with snippet access filtering.
  // This is a best-effort enrichment — errors are caught inside getSummarizerContext().
  const summary = await model.getSummarizerContext()

  // Convert all snippet filepaths to URIs
  const snippetsWithUris: AutocompleteSnippet[] = accessibleSnippets.map((snippet) => {
    if (!hasFilepath(snippet) || !snippet.filepath) return snippet
    const uri = snippet.filepath.startsWith("file://") ? snippet.filepath : vscode.Uri.file(snippet.filepath).toString()
    return { ...snippet, filepath: uri }
  })

  // Prepend summarizer context as a static snippet so the FIM template
  // renders it as a commented code block ahead of the cursor context.
  if (summary) {
    const contextSnippet: AutocompleteSnippet = {
      type: AutocompleteSnippetType.Static,
      filepath: "file:///background_context.txt",
      content: summary,
    }
    snippetsWithUris.unshift(contextSnippet)
  }

  const workspaceDirs = await ide.getWorkspaceDirs()

  return { filepathUri, helper, snippetsWithUris, workspaceDirs }
}
