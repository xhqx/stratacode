import * as vscode from "vscode"

export type LogLevel = "debug" | "info" | "warn" | "error" | "off"

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  off: 4,
}

export class LogConfig {
  private static _isDev = false

  static init(context: vscode.ExtensionContext) {
    this._isDev = context.extensionMode === vscode.ExtensionMode.Development
  }

  static getLevel(): LogLevel {
    const config = vscode.workspace.getConfiguration("strata-code.new")
    const configuredLevel = config.get<string>("logLevel")

    // User explicitly configured to something other than default 'info'
    const inspected = config.inspect<string>("logLevel")
    if (inspected && (inspected.globalValue !== undefined || inspected.workspaceValue !== undefined)) {
      return (configuredLevel as LogLevel) || "info"
    }

    // Default: debug in dev, info in production
    return this._isDev ? "debug" : "info"
  }

  static getRetentionDays(): number {
    return vscode.workspace.getConfiguration("strata-code.new").get<number>("logRetentionDays") ?? 7
  }

  static shouldLog(entryLevel: LogLevel): boolean {
    const currentLevel = this.getLevel()
    return LOG_LEVEL_MAP[entryLevel] >= LOG_LEVEL_MAP[currentLevel]
  }
}
