/* @refresh reload */
import "@stratacode/strata-ui/styles"
import { render } from "solid-js/web"
import App from "./App"

const root = document.getElementById("root")

window.addEventListener("error", (event) => {
  try {
    const vscode = (window as any).acquireVsCodeApi?.()
    if (vscode) {
      vscode.postMessage({
        type: "webviewLog",
        level: "error",
        component: "GlobalError",
        message: event.error?.message || event.message,
        data: [event.error?.stack],
      })
    }
  } catch (e) {
    // ignore
  }
})

if (!root) {
  throw new Error("Root element not found")
}

render(() => <App />, root)
