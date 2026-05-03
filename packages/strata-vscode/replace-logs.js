const fs = require("fs")

function processFile(filePath, componentName) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filePath} (not found)`)
    return
  }
  let content = fs.readFileSync(filePath, "utf8")

  // Compute import path
  let importPath = "./utils/webview-logger"
  if (filePath.includes("agent-manager/")) {
    importPath = "../src/utils/webview-logger"
  }

  // Add import if it doesn't exist
  if (!content.includes("import { WebviewLogger }")) {
    const lastImportIndex = content.lastIndexOf("import ")
    if (lastImportIndex !== -1) {
      const endOfLastImport = content.indexOf("\n", lastImportIndex)
      content =
        content.slice(0, endOfLastImport + 1) +
        `import { WebviewLogger } from "${importPath}"\n` +
        content.slice(endOfLastImport + 1)
    } else {
      content = `import { WebviewLogger } from "${importPath}"\n` + content
    }
  }

  content = content.replace(/console\.log\(/g, `WebviewLogger.info("${componentName}", `)
  content = content.replace(/console\.warn\(/g, `WebviewLogger.warn("${componentName}", `)
  content = content.replace(/console\.error\(/g, `WebviewLogger.error("${componentName}", `)
  content = content.replace(/console\.debug\(/g, `WebviewLogger.debug("${componentName}", `)

  const prefixes = [`\\[Strata(?: New)?\\](?: ${componentName}:)?`, `\\[${componentName}\\]`]

  for (const prefix of prefixes) {
    content = content.replace(
      new RegExp(`WebviewLogger\\.(info|warn|error|debug)\\("${componentName}",\\s*"${prefix}\\s*`, "g"),
      `WebviewLogger.$1("${componentName}", "`,
    )
  }

  fs.writeFileSync(filePath, content, "utf8")
  console.log(`Processed ${filePath}`)
}

processFile("webview-ui/src/App.tsx", "App")
processFile("webview-ui/agent-manager/AgentManagerApp.tsx", "AgentManagerApp")
