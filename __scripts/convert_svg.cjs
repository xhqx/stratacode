const fs = require("fs")
const path = require("path")

const pngPath = path.resolve("packages/strata-vscode/assets/icons/strata-light.png")
const base64 = fs.readFileSync(pngPath).toString("base64")
const uri = `data:image/png;base64,${base64}`

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <image href="${uri}" width="1024" height="1024" />
</svg>`

const files = [
  "packages/strata-docs/public/img/logo.svg",
  "packages/strata-docs/public/img/strata-v1.svg",
  "packages/strata-docs/public/img/strata-v1-white.svg",
  "packages/app/public/favicon.svg",
  "packages/app/public/favicon-v3.svg",
  "packages/ui/src/assets/favicon/favicon.svg",
  "packages/ui/src/assets/favicon/favicon-v3.svg",
]

for (const file of files) {
  fs.writeFileSync(file, svgContent)
  console.log("Updated", file)
}
