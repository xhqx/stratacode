import { readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { MANIFEST } from "../src/stratacode/feature-manifest"

const PACKAGE_JSON_PATH = join(__dirname, "../package.json")

function main() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"))
  const configSections = pkg.contributes.configuration

  const featuresSection = configSections.find((s: any) => s.title === "Strata Code: Features")
  if (!featuresSection) {
    throw new Error("Could not find 'Strata Code: Features' configuration section in package.json")
  }

  const props = featuresSection.properties

  // Remove existing feature properties
  for (const key of Object.keys(props)) {
    if (key.startsWith("strata-code.new.features.")) {
      delete props[key]
    }
  }

  // Add properties from MANIFEST
  for (const [key, spec] of Object.entries(MANIFEST)) {
    props[`strata-code.new.features.${key}`] = {
      type: "boolean",
      default: spec.default,
      description: spec.description,
    }
    if (spec.hidden) {
      // Use markdownDescription or description depending on what it is
      // Actually VS Code supports hiding settings by omitting them from package.json?
      // No, let's keep them if they can be disabled by env vars.
      // But settings hidden from UI can be omitted, but they wouldn't get defaults via VS Code settings API?
      // Yes, if it's not in package.json, `workspace.getConfiguration` might return undefined unless we provide defaults.
      // We read from MANIFEST anyway via `?? MANIFEST[key].default`, so we don't strictly need hidden ones in package.json!
      // But let's leave them for now.
    }
  }

  writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + "\n")
  console.log("Updated package.json feature settings from manifest.")
}

main()
