const fs = require("fs")
const path = require("path")

const enTsPath = path.join(__dirname, "webview-ui/src/i18n/en.ts")
const enTsContent = fs.readFileSync(enTsPath, "utf8")

// very basic extraction, assumes "key": "value" or 'key': "value"
const enKeys = new Set()
const keyRegex = /["'](settings\.[^"']+)["']/g
let match
while ((match = keyRegex.exec(enTsContent)) !== null) {
  enKeys.add(match[1])
}

const glob = require("glob") // Not sure if glob is installed, fallback to fs traversal
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath)
  arrayOfFiles = arrayOfFiles || []
  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      arrayOfFiles.push(path.join(dirPath, file))
    }
  })
  return arrayOfFiles
}

const componentsDir = path.join(__dirname, "webview-ui/src/components/settings")
const allFiles = getAllFiles(componentsDir)

const usedKeys = new Set()
allFiles.forEach((file) => {
  const content = fs.readFileSync(file, "utf8")
  // match t("settings...") or t('settings...')
  const usageRegex = /t\(['"](settings\.[^"']+)['"]/g
  let usageMatch
  while ((usageMatch = usageRegex.exec(content)) !== null) {
    usedKeys.add(usageMatch[1])
  }
})

const missingKeys = []
for (const key of usedKeys) {
  if (!enKeys.has(key)) {
    missingKeys.push(key)
  }
}

console.log("Missing Keys:", missingKeys)
