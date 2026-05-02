import * as vscode from "vscode"
import * as fs from "node:fs"
import * as path from "node:path"
import { scanPlanDirectory, updateCheckbox } from "./markdown-parser"
import type { MarkdownPage } from "./markdown-parser"
import { Logger } from "../stratacode/logger"

export class MarkdownPlanWatcher {
  private watcher: vscode.FileSystemWatcher | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private suppressed = false

  constructor(
    private readonly root: string,
    private readonly onChanged: () => void,
  ) {
    this.start()
  }

  private start() {
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) return
    const pattern = new vscode.RelativePattern(folder, ".strata/plans/**/*.md")
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern)
    this.watcher.onDidChange(() => this.schedule())
    this.watcher.onDidCreate(() => this.schedule())
    this.watcher.onDidDelete(() => this.schedule())
  }

  private schedule() {
    if (this.suppressed) return
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => this.onChanged(), 500)
  }

  public async scan(): Promise<MarkdownPage[]> {
    return scanPlanDirectory(this.root)
  }

  public async writeBack(file: string, line: number, state: " " | "x" | "/"): Promise<void> {
    this.suppressed = true
    try {
      const content = await fs.promises.readFile(file, "utf-8")
      const updated = updateCheckbox(content, line, state)
      if (updated !== content) {
        await fs.promises.writeFile(file, updated, "utf-8")
      }
    } catch (err) {
      Logger.warn("MarkdownPlanWatcher", "MarkdownPlanWatcher.writeBack failed:", err)
    } finally {
      setTimeout(() => {
        this.suppressed = false
      }, 200)
    }
  }

  public async openFile(file: string, line?: number): Promise<void> {
    try {
      // Create file if it doesn't exist
      const exists = await fs.promises.access(file).then(() => true).catch(() => false)
      if (!exists) {
        const dir = path.dirname(file)
        await fs.promises.mkdir(dir, { recursive: true })
        const name = path.basename(file, ".md")
        const title = name === "index" ? "Project Plan" : name.charAt(0).toUpperCase() + name.slice(1)
        const template = `# ${title}\n\n## Tasks\n\n- [ ] First task\n  <!-- strata: priority=3 -->\n  Describe what needs to be done.\n`
        await fs.promises.writeFile(file, template, "utf-8")
      }

      const uri = vscode.Uri.file(file)
      const doc = await vscode.workspace.openTextDocument(uri)
      const selection = line
        ? new vscode.Range(line - 1, 0, line - 1, 0) // 0-based conversion
        : undefined
      await vscode.window.showTextDocument(doc, { selection })
    } catch (err) {
      Logger.warn("MarkdownPlanWatcher", "MarkdownPlanWatcher.openFile failed:", err)
    }
  }

  public dispose() {
    if (this.debounce) clearTimeout(this.debounce)
    this.watcher?.dispose()
  }
}
