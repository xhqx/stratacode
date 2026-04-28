// StrataClaw SolidJS webview entry point

import { render } from "solid-js/web"
import "@stratacode/strata-ui/styles"
import "./strataclaw.css"
import { StrataClawApp } from "./StrataClawApp"

const root = document.getElementById("root")
if (root) {
  render(() => <StrataClawApp />, root)
}
