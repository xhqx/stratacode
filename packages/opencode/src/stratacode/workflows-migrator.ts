import * as fs from "fs/promises"
import * as path from "path"
import os from "os"
import type { Config } from "../config"
import type { ConfigCommand } from "../config"
import { Filesystem } from "../util"
import { StratacodePaths } from "./paths"

export namespace WorkflowsMigrator {
  const home = () => process.env.HOME || process.env.USERPROFILE || os.homedir()

  // .stratacode first (lower precedence), .strata second (higher precedence / wins)
  const STRATA_WORKFLOWS_DIRS = [".stratacode/workflows", ".strata/workflows"]
  const globalWorkflowsDirs = () => [
    path.join(home(), ".stratacode", "workflows"),
    path.join(home(), ".strata", "workflows"),
  ]

  export interface StratacodeWorkflow {
    name: string
    path: string
    content: string
    source: "global" | "project"
  }

  export interface MigrationResult {
    commands: Record<string, ConfigCommand.Info>
    warnings: string[]
  }

  async function findWorkflowFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => path.join(dir, e.name))
  }

  export function extractNameFromFilename(filename: string): string {
    return path.basename(filename, ".md")
  }

  export function extractDescription(content: string): string | undefined {
    const lines = content.split("\n")
    let foundTitle = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("#")) {
        foundTitle = true
        continue
      }
      if (foundTitle && trimmed.length > 0) {
        return trimmed.slice(0, 200)
      }
    }
    return undefined
  }

  async function loadWorkflowsFromDir(dir: string, source: "global" | "project"): Promise<StratacodeWorkflow[]> {
    if (!(await Filesystem.isDir(dir))) return []
    const files = await findWorkflowFiles(dir)
    const workflows: StratacodeWorkflow[] = []
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8")
      workflows.push({
        name: extractNameFromFilename(file),
        path: file,
        content: content.trim(),
        source,
      })
    }
    return workflows
  }

  export async function discoverWorkflows(
    projectDir: string,
    skipGlobalPaths?: boolean,
  ): Promise<StratacodeWorkflow[]> {
    const workflows: StratacodeWorkflow[] = []

    if (!skipGlobalPaths) {
      // 1. VSCode extension global storage (primary location for global workflows)
      const vscodeWorkflowsDir = path.join(StratacodePaths.vscodeGlobalStorage(), "workflows")
      workflows.push(...(await loadWorkflowsFromDir(vscodeWorkflowsDir, "global")))

      // 2. Home directories ~/.stratacode/workflows and ~/.strata/workflows
      for (const dir of globalWorkflowsDirs()) {
        workflows.push(...(await loadWorkflowsFromDir(dir, "global")))
      }
    }

    // 3. Project workflows (.strata/workflows/ and .stratacode/workflows/)
    for (const dir of STRATA_WORKFLOWS_DIRS) {
      workflows.push(...(await loadWorkflowsFromDir(path.join(projectDir, dir), "project")))
    }

    return workflows
  }

  export function convertToCommand(workflow: StratacodeWorkflow): ConfigCommand.Info {
    return {
      template: workflow.content,
      description: extractDescription(workflow.content) ?? `Workflow: ${workflow.name}`,
    }
  }

  export async function migrate(options: {
    projectDir: string
    /** Skip reading from global paths. Used for testing. */
    skipGlobalPaths?: boolean
  }): Promise<MigrationResult> {
    const warnings: string[] = []
    const commands: Record<string, ConfigCommand.Info> = {}

    const workflows = await discoverWorkflows(options.projectDir, options.skipGlobalPaths)

    // Deduplicate by name (project takes precedence over global)
    const workflowsByName = new Map<string, StratacodeWorkflow>()

    // Add global first
    for (const workflow of workflows.filter((w) => w.source === "global")) {
      workflowsByName.set(workflow.name, workflow)
    }

    // Project overwrites global
    for (const workflow of workflows.filter((w) => w.source === "project")) {
      if (workflowsByName.has(workflow.name)) {
        warnings.push(`Project workflow '${workflow.name}' overrides global workflow`)
      }
      workflowsByName.set(workflow.name, workflow)
    }

    // Convert to commands
    for (const [name, workflow] of workflowsByName) {
      commands[name] = convertToCommand(workflow)
    }

    return { commands, warnings }
  }
}
