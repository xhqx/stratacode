const fs = require("fs")
const file = "packages/strata-vscode/src/StrataProvider.ts"
let content = fs.readFileSync(file, "utf8")

const target = `    } else {
      const workspace = this.getWorkspaceDirectory()
      try {
        await this.client.instance.dispose({ directory: workspace })
      } catch (e) {
        console.warn("[Strata New] Failed to dispose workspace instance:", e)
      }
    }`

const replacement = `    }
    
    // Always dispose the workspace instance so it clears its cache
    const workspace = this.getWorkspaceDirectory()
    try {
      await this.client.instance.dispose({ directory: workspace })
    } catch (e) {
      console.warn("[Strata New] Failed to dispose workspace instance:", e)
    }`

if (content.includes(target)) {
  content = content.replace(target, replacement)
  fs.writeFileSync(file, content)
  console.log("Patched successfully")
} else {
  console.log("Target not found")
}
