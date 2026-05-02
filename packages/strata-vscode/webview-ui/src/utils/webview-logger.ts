import { getVSCodeAPI } from "../context/vscode"

class WebviewLoggerImpl {
  private log(level: "debug" | "info" | "warn" | "error", component: string, message: string, ...data: any[]) {
    // Also log to the browser console for local debugging
    switch (level) {
      case "debug":
        console.debug(`[${component}] ${message}`, ...data)
        break
      case "info":
        console.log(`[${component}] ${message}`, ...data)
        break
      case "warn":
        console.warn(`[${component}] ${message}`, ...data)
        break
      case "error":
        console.error(`[${component}] ${message}`, ...data)
        break
    }

    try {
      const api = getVSCodeAPI()
      // Post the structured log message to the extension host
      api.postMessage({
        type: "webviewLog",
        level,
        component,
        message,
        data: data.length > 0 ? data : undefined,
      })
    } catch (e) {
      // getVSCodeAPI might throw if we're completely outside a proper environment,
      // but we shouldn't break the app just because logging failed.
      console.warn(`[WebviewLogger] Failed to post log message:`, e)
    }
  }

  debug(component: string, message: string, ...data: any[]) {
    this.log("debug", component, message, ...data)
  }

  info(component: string, message: string, ...data: any[]) {
    this.log("info", component, message, ...data)
  }

  warn(component: string, message: string, ...data: any[]) {
    this.log("warn", component, message, ...data)
  }

  error(component: string, message: string, ...data: any[]) {
    this.log("error", component, message, ...data)
  }
}

export const WebviewLogger = new WebviewLoggerImpl()
