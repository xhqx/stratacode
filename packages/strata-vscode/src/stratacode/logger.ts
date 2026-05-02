import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { LogConfig, LogLevel } from './log-config'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  data?: any
}

export class Logger {
  private static outputChannel: vscode.OutputChannel | null = null
  private static logDir: string = path.join(os.homedir(), '.strata', 'logs', 'vscode')
  private static batchedEntries: string[] = []
  private static batchTimer: NodeJS.Timeout | null = null
  private static initialized = false

  static init(context: vscode.ExtensionContext) {
    if (this.initialized) return
    
    this.outputChannel = vscode.window.createOutputChannel('Strata Logs')
    LogConfig.init(context)
    
    // Ensure dir exists synchronously during init so immediate logs don't fail
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }

    this.initialized = true
    this.info('Logger', 'Logger initialized', {
      level: LogConfig.getLevel(),
      logDir: this.logDir,
      retentionDays: LogConfig.getRetentionDays()
    })
    
    // Rotate old logs asynchronously
    this.rotateLogs().catch(err => {
      this.error('Logger', 'Failed to rotate logs', err)
    })
  }

  static debug(component: string, message: string, data?: any) {
    this.log('debug', component, message, data)
  }

  static info(component: string, message: string, data?: any) {
    this.log('info', component, message, data)
  }

  static warn(component: string, message: string, data?: any) {
    this.log('warn', component, message, data)
  }

  static error(component: string, message: string, data?: any) {
    this.log('error', component, message, data)
  }

  private static log(level: LogLevel, component: string, message: string, data?: any) {
    if (!LogConfig.shouldLog(level)) return

    const timestamp = new Date().toISOString()
    const entry: LogEntry = {
      timestamp,
      level,
      component,
      message,
    }
    
    // Only include data if present and not empty
    if (data !== undefined && data !== null) {
      if (data instanceof Error) {
        entry.data = { message: data.message, stack: data.stack, name: data.name }
      } else {
        // Safe stringify for circular references or big objects could be used here if needed,
        // but for now we assume caller passes safe JSON objects or Error objects.
        entry.data = data
      }
    }

    // 1. Write to OutputChannel
    if (this.outputChannel) {
      let dataStr = ''
      if (entry.data) {
        try {
          dataStr = ` ${JSON.stringify(entry.data)}`
        } catch {
          dataStr = ' [Data serialization failed]'
        }
      }
      this.outputChannel.appendLine(`[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${dataStr}`)
    }

    // 2. Batch for File writing
    try {
      const jsonl = JSON.stringify(entry)
      this.batchedEntries.push(jsonl)
    } catch {
      // Fallback if data is not stringifiable
      entry.data = '[Serialization failed]'
      this.batchedEntries.push(JSON.stringify(entry))
    }

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), 500)
    }
  }

  private static getLogFilePath(): string {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    return path.join(this.logDir, `strata-${today}.jsonl`)
  }

  private static async flush() {
    this.batchTimer = null
    if (this.batchedEntries.length === 0) return

    const entriesToWrite = [...this.batchedEntries]
    this.batchedEntries = []

    try {
      const file = this.getLogFilePath()
      const content = entriesToWrite.join('\n') + '\n'
      await fs.promises.appendFile(file, content, 'utf8')
    } catch (err) {
      if (this.outputChannel) {
        this.outputChannel.appendLine(`[ERROR] [Logger] Failed to write logs to disk: ${err}`)
      }
    }
  }

  private static async rotateLogs() {
    try {
      const files = await fs.promises.readdir(this.logDir)
      const retentionDays = LogConfig.getRetentionDays()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      for (const file of files) {
        if (!file.startsWith('strata-') || !file.endsWith('.jsonl')) continue

        const dateStr = file.replace('strata-', '').replace('.jsonl', '')
        const fileDate = new Date(dateStr)

        if (!isNaN(fileDate.getTime()) && fileDate < cutoffDate) {
          await fs.promises.unlink(path.join(this.logDir, file))
        }
      }
    } catch (err) {
      if (this.outputChannel) {
        this.outputChannel.appendLine(`[ERROR] [Logger] Failed to clean up old logs: ${err}`)
      }
    }
  }

  static dispose() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.flush().catch(() => {})
    }
  }
}
