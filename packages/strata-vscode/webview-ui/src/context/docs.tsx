// stratacode_change - new file
import { createContext, createSignal, useContext, onMount, onCleanup } from "solid-js"
import { useVSCode } from "./vscode"

export interface DocPageDef {
  id: string
  title: string
  path: string
  type: string
  status: "draft" | "generated" | "error"
}

export interface DocManifest {
  version: string
  lastUpdated: string
  pages: DocPageDef[]
}

export interface DocPageContent {
  id: string
  content: string
  lastUpdated: string
}

interface DocsContextType {
  manifest: () => DocManifest | null
  currentPage: () => DocPageContent | null
  isLoadingManifest: () => boolean
  isLoadingPage: () => boolean
  isGenerating: () => boolean
  requestManifest: () => void
  requestPage: (id: string) => void
  generateAll: () => void
  regeneratePage: (id: string) => void
}

const DocsContext = createContext<DocsContextType>()

export function DocsProvider(props: { children: any }) {
  const vscode = useVSCode()

  const [manifest, setManifest] = createSignal<DocManifest | null>(null)
  const [currentPage, setCurrentPage] = createSignal<DocPageContent | null>(null)
  const [isLoadingManifest, setIsLoadingManifest] = createSignal(false)
  const [isLoadingPage, setIsLoadingPage] = createSignal(false)
  const [isGenerating, setIsGenerating] = createSignal(false)

  onMount(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data
      if (message?.type === "docsManifest") {
        setManifest(message.manifest)
        setIsLoadingManifest(false)
      } else if (message?.type === "docsPage") {
        setCurrentPage(message.page)
        setIsLoadingPage(false)
      } else if (message?.type === "docsGenerationStarted") {
        setIsGenerating(true)
      } else if (message?.type === "docsGenerationComplete") {
        setIsGenerating(false)
        // Refresh manifest
        requestManifest()
      } else if (message?.type === "docsGenerationError") {
        setIsGenerating(false)
      }
    }
    window.addEventListener("message", handler)
    onCleanup(() => window.removeEventListener("message", handler))

    requestManifest()
  })

  const requestManifest = () => {
    setIsLoadingManifest(true)
    vscode.postMessage({ type: "docs.requestManifest" })
  }

  const requestPage = (id: string) => {
    setIsLoadingPage(true)
    vscode.postMessage({ type: "docs.requestPage", id })
  }

  const generateAll = () => {
    setIsGenerating(true)
    vscode.postMessage({
      type: "docs.generate",
    })
  }

  const regeneratePage = (id: string) => {
    setIsGenerating(true)
    vscode.postMessage({
      type: "docs.regenerate",
      id,
    })
  }

  return (
    <DocsContext.Provider
      value={{
        manifest,
        currentPage,
        isLoadingManifest,
        isLoadingPage,
        isGenerating,
        requestManifest,
        requestPage,
        generateAll,
        regeneratePage,
      }}
    >
      {props.children}
    </DocsContext.Provider>
  )
}

export function useDocs() {
  const context = useContext(DocsContext)
  if (!context) {
    throw new Error("useDocs must be used within a DocsProvider")
  }
  return context
}
