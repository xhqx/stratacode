#!/usr/bin/env bun
/**
 * Enhanced package.json transform with Strata dependency injection
 *
 * This script handles package.json conflicts by:
 * 1. Taking upstream's version (to get new dependencies)
 * 2. Transforming package names (opencode -> strata)
 * 3. Injecting Strata-specific dependencies
 * 4. Preserving Strata's version number
 * 5. Preserving overrides and patchedDependencies
 * 6. Preserving Strata's repository configuration
 * 7. Using "newest wins" strategy for dependency versions
 */

import { $ } from "bun"
import { info, success, warn, debug } from "../utils/logger"
import { getCurrentVersion } from "./preserve-versions"
import { oursHasStratacodeChanges } from "../utils/git"

/**
 * Extract clean version string from a version specifier
 * Removes ^, ~, >=, etc. prefixes
 */
function extractVersion(version: string): string | null {
  // Handle special formats that can't be compared
  if (
    version.startsWith("workspace:") ||
    version.startsWith("catalog:") ||
    version.startsWith("http://") ||
    version.startsWith("https://") ||
    version.startsWith("git://") ||
    version.startsWith("git+") ||
    version.startsWith("file:") ||
    version.startsWith("link:") ||
    version.startsWith("npm:")
  ) {
    return null
  }

  // Remove common prefixes: ^, ~, >=, >, <=, <, =
  const cleaned = version.replace(/^[\^~>=<]+/, "").trim()

  // Basic semver validation (x.y.z with optional pre-release/build)
  if (/^\d+\.\d+\.\d+/.test(cleaned)) {
    return cleaned
  }

  // Handle x.y format
  if (/^\d+\.\d+$/.test(cleaned)) {
    return cleaned + ".0"
  }

  // Handle single number
  if (/^\d+$/.test(cleaned)) {
    return cleaned + ".0.0"
  }

  return null
}

/**
 * Parse a semver string into components
 */
function parseSemver(version: string): { major: number; minor: number; patch: number; prerelease: string } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?/)
  if (!match) return null

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || "",
  }
}

/**
 * Compare two version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 * For special formats (URLs, catalog:, workspace:*), returns null (can't compare)
 */
function compareVersions(a: string, b: string): number | null {
  const cleanA = extractVersion(a)
  const cleanB = extractVersion(b)

  // If either can't be parsed, return null (can't compare)
  if (!cleanA || !cleanB) return null

  const semverA = parseSemver(cleanA)
  const semverB = parseSemver(cleanB)

  if (!semverA || !semverB) return null

  // Compare major.minor.patch
  if (semverA.major !== semverB.major) return semverA.major > semverB.major ? 1 : -1
  if (semverA.minor !== semverB.minor) return semverA.minor > semverB.minor ? 1 : -1
  if (semverA.patch !== semverB.patch) return semverA.patch > semverB.patch ? 1 : -1

  // Handle prerelease (no prerelease > prerelease)
  if (!semverA.prerelease && semverB.prerelease) return 1
  if (semverA.prerelease && !semverB.prerelease) return -1
  if (semverA.prerelease && semverB.prerelease) {
    return semverA.prerelease.localeCompare(semverB.prerelease)
  }

  return 0
}

/**
 * Merge two dependency objects using "newest wins" strategy
 * For non-comparable versions (URLs, catalog:, workspace:*), upstream (theirs) wins
 */
function mergeWithNewestVersions(
  ours: Record<string, string> | undefined,
  theirs: Record<string, string> | undefined,
  changes: string[],
  section: string,
): Record<string, string> {
  const result: Record<string, string> = {}

  // Start with all of theirs
  if (theirs) {
    for (const [name, version] of Object.entries(theirs)) {
      result[name] = version
    }
  }

  // Merge in ours, keeping newer versions
  if (ours) {
    for (const [name, ourVersion] of Object.entries(ours)) {
      const theirVersion = result[name]

      if (!theirVersion) {
        // Dependency only exists in ours - keep it
        result[name] = ourVersion
        changes.push(`${section}: preserved ${name}@${ourVersion} (strata-only)`)
      } else if (ourVersion !== theirVersion) {
        // Both have it with different versions - compare
        const comparison = compareVersions(ourVersion, theirVersion)

        if (comparison === null) {
          // Can't compare (special format) - upstream wins per user preference
          changes.push(`${section}: ${name} kept upstream ${theirVersion} (special format)`)
        } else if (comparison > 0) {
          // Ours is newer
          result[name] = ourVersion
          changes.push(`${section}: ${name} ${theirVersion} -> ${ourVersion} (strata newer)`)
        } else if (comparison < 0) {
          // Theirs is newer - already in result
          changes.push(`${section}: ${name} kept upstream ${theirVersion} (upstream newer)`)
        }
        // If equal, keep theirs (already in result)
      }
    }
  }

  return result
}

export interface PackageJsonResult {
  file: string
  action: "transformed" | "skipped" | "failed" | "flagged"
  changes: string[]
  dryRun: boolean
}

export interface PackageJsonOptions {
  dryRun?: boolean
  verbose?: boolean
  preserveVersion?: boolean
}

// Package name mappings
const PACKAGE_NAME_MAP: Record<string, string> = {
  "opencode-ai": "@stratacode/cli",
  "@opencode-ai/cli": "@stratacode/cli",
  "@opencode-ai/sdk": "@stratacode/sdk",
  "@opencode-ai/plugin": "@stratacode/plugin",
}

// Strata-specific dependencies to inject into specific packages
// NOTE: When adding new Strata-specific workspace dependencies (packages starting with @stratacode/strata-*),
// add them here to prevent them from being removed during upstream merges
const STRATA_DEPENDENCIES: Record<string, Record<string, string>> = {
  // packages/opencode/package.json needs these
  "packages/opencode/package.json": {
    "@stratacode/strata-gateway": "workspace:*",
    "@stratacode/strata-telemetry": "workspace:*",
  },
  // packages/app/package.json needs these
  "packages/app/package.json": {
    "@stratacode/strata-i18n": "workspace:*",
  },
}

// Strata-specific bin entries to set on specific packages
const STRATA_BIN: Record<string, Record<string, string>> = {
  "packages/opencode/package.json": {
    strata: "./bin/strata",
    stratacode: "./bin/strata",
  },
}

// Packages that should have their name transformed
const TRANSFORM_PACKAGE_NAMES: Record<string, string> = {
  "package.json": "@stratacode/strata",
  "packages/opencode/package.json": "@stratacode/cli",
  "packages/plugin/package.json": "@stratacode/plugin",
  "packages/sdk/js/package.json": "@stratacode/sdk",
}

/**
 * Check if file is a package.json
 */
export function isPackageJson(file: string): boolean {
  return file.endsWith("package.json")
}

/**
 * Transform dependencies in package.json
 */
function transformDependencies(deps: Record<string, string> | undefined): {
  result: Record<string, string>
  changes: string[]
} {
  if (!deps) return { result: {}, changes: [] }

  const result: Record<string, string> = {}
  const changes: string[] = []

  for (const [name, version] of Object.entries(deps)) {
    const newName = PACKAGE_NAME_MAP[name]
    if (newName) {
      result[newName] = version
      changes.push(`${name} -> ${newName}`)
    } else {
      result[name] = version
    }
  }

  return { result, changes }
}

/**
 * Transform a package.json file
 */
export async function transformPackageJson(file: string, options: PackageJsonOptions = {}): Promise<PackageJsonResult> {
  const changes: string[] = []

  if (options.dryRun) {
    info(`[DRY-RUN] Would transform package.json: ${file}`)
    return { file, action: "transformed", changes: [], dryRun: true }
  }

  // If our version has stratacode_change markers, flag for manual resolution
  if (await oursHasStratacodeChanges(file)) {
    warn(`${file} has stratacode_change markers — skipping auto-transform, needs manual resolution`)
    return { file, action: "flagged", changes: [], dryRun: false }
  }

  try {
    // Save Strata's version BEFORE taking theirs
    let ourPkg: Record<string, unknown> | null = null
    try {
      const ourContent = await $`git show :2:${file}`.text() // :2: is "ours" in merge
      ourPkg = JSON.parse(ourContent)
    } catch {
      // File might not exist in ours (new file from upstream)
      // or we're not in a merge conflict - try reading current file
      try {
        const currentContent = await Bun.file(file).text()
        if (!currentContent.includes("<<<<<<<")) {
          // Not a conflict, read as-is
          ourPkg = JSON.parse(currentContent)
        }
      } catch {
        // File doesn't exist yet
      }
    }

    // Take upstream's version
    await $`git checkout --theirs ${file}`.quiet().nothrow()
    await $`git add ${file}`.quiet().nothrow()

    // Read and parse upstream's version
    const content = await Bun.file(file).text()
    const pkg = JSON.parse(content)

    // 1. Transform package name if needed
    const relativePath = file.replace(process.cwd() + "/", "")
    const newName = TRANSFORM_PACKAGE_NAMES[relativePath]
    if (newName && pkg.name !== newName) {
      changes.push(`name: ${pkg.name} -> ${newName}`)
      pkg.name = newName
    }

    // 2. Preserve Strata version if requested
    if (options.preserveVersion !== false) {
      const strataVersion = await getCurrentVersion()
      if (pkg.version !== strataVersion) {
        changes.push(`version: ${pkg.version} -> ${strataVersion}`)
        pkg.version = strataVersion
      }
    }

    // 3. Merge dependencies with "newest wins" strategy
    if (ourPkg) {
      pkg.dependencies = mergeWithNewestVersions(
        ourPkg.dependencies as Record<string, string> | undefined,
        pkg.dependencies,
        changes,
        "dependencies",
      )

      pkg.devDependencies = mergeWithNewestVersions(
        ourPkg.devDependencies as Record<string, string> | undefined,
        pkg.devDependencies,
        changes,
        "devDependencies",
      )

      pkg.peerDependencies = mergeWithNewestVersions(
        ourPkg.peerDependencies as Record<string, string> | undefined,
        pkg.peerDependencies,
        changes,
        "peerDependencies",
      )

      // 4. Preserve/merge overrides
      const ourOverrides = ourPkg.overrides as Record<string, string> | undefined
      if (ourOverrides || pkg.overrides) {
        pkg.overrides = mergeWithNewestVersions(ourOverrides, pkg.overrides, changes, "overrides")
      }

      // 5. Preserve patchedDependencies (Strata-specific, upstream won't have these)
      const ourPatchedDeps = ourPkg.patchedDependencies as Record<string, string> | undefined
      if (ourPatchedDeps) {
        pkg.patchedDependencies = pkg.patchedDependencies || {}
        for (const [name, patch] of Object.entries(ourPatchedDeps)) {
          if (!pkg.patchedDependencies[name]) {
            pkg.patchedDependencies[name] = patch
            changes.push(`patchedDependencies: preserved ${name}`)
          }
        }
      }

      // 6. Preserve repository (Strata-specific, upstream doesn't have this)
      const ourRepo = ourPkg.repository
      if (ourRepo && JSON.stringify(pkg.repository) !== JSON.stringify(ourRepo)) {
        pkg.repository = ourRepo
        changes.push(`repository: preserved Strata's repository configuration`)
      }

      // 7. Handle workspaces for root package.json
      // Strata has removed hosted platform packages (console/*, slack, etc.)
      // so we need to preserve Strata's workspace configuration instead of taking upstream's
      const ourWorkspaces = ourPkg.workspaces as { packages?: string[]; catalog?: Record<string, string> } | undefined
      const theirWorkspaces = pkg.workspaces as { packages?: string[]; catalog?: Record<string, string> } | undefined

      if (relativePath === "package.json" && ourWorkspaces?.packages) {
        pkg.workspaces = pkg.workspaces || {}
        pkg.workspaces.packages = ourWorkspaces.packages
        changes.push(`workspaces.packages: preserved Strata's workspace configuration`)
      }

      const ourScripts = ourPkg.scripts as Record<string, string> | undefined
      if (relativePath === "package.json" && ourScripts?.extension && pkg.scripts?.extension !== ourScripts.extension) {
        pkg.scripts = pkg.scripts || {}
        pkg.scripts.extension = ourScripts.extension
        changes.push(`scripts.extension: preserved Strata's extension script`)
      }
      if (relativePath === "package.json" && ourScripts?.changeset && pkg.scripts?.changeset !== ourScripts.changeset) {
        pkg.scripts = pkg.scripts || {}
        pkg.scripts.changeset = ourScripts.changeset
        changes.push(`scripts.changeset: preserved Strata's changeset script`)
      }
      if (
        relativePath === "package.json" &&
        ourScripts?.["changeset:version"] &&
        pkg.scripts?.["changeset:version"] !== ourScripts["changeset:version"]
      ) {
        pkg.scripts = pkg.scripts || {}
        pkg.scripts["changeset:version"] = ourScripts["changeset:version"]
        changes.push(`scripts.changeset:version: preserved Strata's changeset:version script`)
      }

      // Preserve Strata's test runner scripts for packages/opencode
      if (
        relativePath === "packages/opencode/package.json" &&
        ourScripts?.test &&
        pkg.scripts?.test !== ourScripts.test
      ) {
        pkg.scripts = pkg.scripts || {}
        pkg.scripts.test = ourScripts.test
        changes.push(`scripts.test: preserved Strata's test runner script`)
      }
      if (
        relativePath === "packages/opencode/package.json" &&
        ourScripts?.["test:ci"] &&
        pkg.scripts?.["test:ci"] !== ourScripts["test:ci"]
      ) {
        pkg.scripts = pkg.scripts || {}
        pkg.scripts["test:ci"] = ourScripts["test:ci"]
        changes.push(`scripts.test:ci: preserved Strata's CI test runner script`)
      }

      // Merge catalog with "newest wins" strategy
      if (ourWorkspaces?.catalog || theirWorkspaces?.catalog) {
        pkg.workspaces = pkg.workspaces || {}
        pkg.workspaces.catalog = mergeWithNewestVersions(
          ourWorkspaces?.catalog,
          theirWorkspaces?.catalog,
          changes,
          "workspaces.catalog",
        )
      }
    }

    // 7. Transform dependency names (opencode -> strata)
    if (pkg.dependencies) {
      const { result, changes: depChanges } = transformDependencies(pkg.dependencies)
      pkg.dependencies = result
      changes.push(...depChanges.map((c) => `dependencies: ${c}`))
    }

    if (pkg.devDependencies) {
      const { result, changes: devChanges } = transformDependencies(pkg.devDependencies)
      if (devChanges.length > 0) {
        pkg.devDependencies = result
        changes.push(...devChanges.map((c) => `devDependencies: ${c}`))
      }
    }

    if (pkg.peerDependencies) {
      const { result, changes: peerChanges } = transformDependencies(pkg.peerDependencies)
      if (peerChanges.length > 0) {
        pkg.peerDependencies = result
        changes.push(...peerChanges.map((c) => `peerDependencies: ${c}`))
      }
    }

    // 8. Inject Strata-specific dependencies
    const strataDeps = STRATA_DEPENDENCIES[relativePath]
    if (strataDeps) {
      pkg.dependencies = pkg.dependencies || {}
      for (const [name, version] of Object.entries(strataDeps)) {
        if (!pkg.dependencies[name]) {
          pkg.dependencies[name] = version
          changes.push(`injected: ${name}`)
        }
      }
    }

    // 9. Set Strata-specific bin entries
    const strataBin = STRATA_BIN[relativePath]
    if (strataBin) {
      pkg.bin = strataBin
      changes.push(`bin: set Strata bin entries`)
    }

    // Write back with proper formatting
    const newContent = JSON.stringify(pkg, null, 2) + "\n"
    await Bun.write(file, newContent)
    await $`git add ${file}`.quiet().nothrow()

    if (changes.length > 0) {
      success(`Transformed ${file}: ${changes.length} changes`)
      if (options.verbose) {
        for (const change of changes) {
          debug(`  - ${change}`)
        }
      }
    }

    return { file, action: "transformed", changes, dryRun: false }
  } catch (err) {
    warn(`Failed to transform ${file}: ${err}`)
    return { file, action: "failed", changes: [], dryRun: false }
  }
}

/**
 * Transform conflicted package.json files
 */
export async function transformConflictedPackageJson(
  files: string[],
  options: PackageJsonOptions = {},
): Promise<PackageJsonResult[]> {
  const results: PackageJsonResult[] = []

  for (const file of files) {
    if (!isPackageJson(file)) {
      results.push({ file, action: "skipped", changes: [], dryRun: options.dryRun ?? false })
      continue
    }

    const result = await transformPackageJson(file, options)
    results.push(result)
  }

  return results
}

/**
 * Get Strata's package.json from the base branch (main) for comparison
 * Used during pre-merge to compare upstream versions against Strata's versions
 */
async function getStrataPackageJson(path: string, baseBranch = "main"): Promise<Record<string, unknown> | null> {
  try {
    // Try to get the file from origin/main (or whatever base branch)
    const content = await $`git show origin/${baseBranch}:${path}`.text()
    return JSON.parse(content)
  } catch {
    // File might not exist in Strata
    return null
  }
}

/**
 * Transform all package.json files (pre-merge, on opencode branch)
 * This function merges Strata's versions with upstream, using "newest wins" strategy
 */
export async function transformAllPackageJson(options: PackageJsonOptions = {}): Promise<PackageJsonResult[]> {
  const { Glob } = await import("bun")
  const results: PackageJsonResult[] = []

  // Find all package.json files
  const glob = new Glob("**/package.json")

  for await (const path of glob.scan({ absolute: false })) {
    // Skip node_modules
    if (path.includes("node_modules")) continue

    const file = Bun.file(path)
    if (!(await file.exists())) continue

    try {
      const content = await file.text()
      const pkg = JSON.parse(content) // This is upstream's version
      const changes: string[] = []

      // Get Strata's version from base branch for comparison
      const strataPkg = await getStrataPackageJson(path)

      // 1. Transform package name if needed
      const newName = TRANSFORM_PACKAGE_NAMES[path]
      if (newName && pkg.name !== newName) {
        changes.push(`name: ${pkg.name} -> ${newName}`)
        pkg.name = newName
      }

      // 2. Preserve Strata version if requested
      if (options.preserveVersion !== false) {
        const strataVersion = await getCurrentVersion()
        if (pkg.version !== strataVersion) {
          changes.push(`version: ${pkg.version} -> ${strataVersion}`)
          pkg.version = strataVersion
        }
      }

      // 3. Merge dependencies with "newest wins" strategy (if Strata has this file)
      if (strataPkg) {
        pkg.dependencies = mergeWithNewestVersions(
          strataPkg.dependencies as Record<string, string> | undefined,
          pkg.dependencies,
          changes,
          "dependencies",
        )

        pkg.devDependencies = mergeWithNewestVersions(
          strataPkg.devDependencies as Record<string, string> | undefined,
          pkg.devDependencies,
          changes,
          "devDependencies",
        )

        pkg.peerDependencies = mergeWithNewestVersions(
          strataPkg.peerDependencies as Record<string, string> | undefined,
          pkg.peerDependencies,
          changes,
          "peerDependencies",
        )

        // 4. Preserve/merge overrides
        const strataOverrides = strataPkg.overrides as Record<string, string> | undefined
        if (strataOverrides || pkg.overrides) {
          pkg.overrides = mergeWithNewestVersions(strataOverrides, pkg.overrides, changes, "overrides")
        }

        // 5. Preserve patchedDependencies (Strata-specific, upstream won't have these)
        const strataPatchedDeps = strataPkg.patchedDependencies as Record<string, string> | undefined
        if (strataPatchedDeps) {
          pkg.patchedDependencies = pkg.patchedDependencies || {}
          for (const [name, patch] of Object.entries(strataPatchedDeps)) {
            if (!pkg.patchedDependencies[name]) {
              pkg.patchedDependencies[name] = patch
              changes.push(`patchedDependencies: preserved ${name}`)
            }
          }
        }

        // 6. Preserve repository (Strata-specific, upstream doesn't have this)
        const strataRepo = strataPkg.repository
        if (strataRepo && JSON.stringify(pkg.repository) !== JSON.stringify(strataRepo)) {
          pkg.repository = strataRepo
          changes.push(`repository: preserved Strata's repository configuration`)
        }

        // 7. Handle workspaces for root package.json
        // Strata has removed hosted platform packages (console/*, slack, etc.)
        // so we need to preserve Strata's workspace configuration instead of taking upstream's
        const strataWorkspaces = strataPkg.workspaces as
          | { packages?: string[]; catalog?: Record<string, string> }
          | undefined
        const upstreamWorkspaces = pkg.workspaces as
          | { packages?: string[]; catalog?: Record<string, string> }
          | undefined

        if (path === "package.json" && strataWorkspaces?.packages) {
          pkg.workspaces = pkg.workspaces || {}
          pkg.workspaces.packages = strataWorkspaces.packages
          changes.push(`workspaces.packages: preserved Strata's workspace configuration`)
        }

        const strataScripts = strataPkg.scripts as Record<string, string> | undefined
        if (path === "package.json" && strataScripts?.extension && pkg.scripts?.extension !== strataScripts.extension) {
          pkg.scripts = pkg.scripts || {}
          pkg.scripts.extension = strataScripts.extension
          changes.push(`scripts.extension: preserved Strata's extension script`)
        }

        // Preserve Strata's test runner scripts for packages/opencode
        if (
          path === "packages/opencode/package.json" &&
          strataScripts?.test &&
          pkg.scripts?.test !== strataScripts.test
        ) {
          pkg.scripts = pkg.scripts || {}
          pkg.scripts.test = strataScripts.test
          changes.push(`scripts.test: preserved Strata's test runner script`)
        }
        if (
          path === "packages/opencode/package.json" &&
          strataScripts?.["test:ci"] &&
          pkg.scripts?.["test:ci"] !== strataScripts["test:ci"]
        ) {
          pkg.scripts = pkg.scripts || {}
          pkg.scripts["test:ci"] = strataScripts["test:ci"]
          changes.push(`scripts.test:ci: preserved Strata's CI test runner script`)
        }

        // Merge catalog with "newest wins" strategy
        if (strataWorkspaces?.catalog || upstreamWorkspaces?.catalog) {
          pkg.workspaces = pkg.workspaces || {}
          pkg.workspaces.catalog = mergeWithNewestVersions(
            strataWorkspaces?.catalog,
            upstreamWorkspaces?.catalog,
            changes,
            "workspaces.catalog",
          )
        }
      }

      // 7. Transform dependency names (opencode -> strata)
      if (pkg.dependencies) {
        const { result, changes: depChanges } = transformDependencies(pkg.dependencies)
        if (depChanges.length > 0) {
          pkg.dependencies = result
          changes.push(...depChanges.map((c) => `dependencies: ${c}`))
        }
      }

      if (pkg.devDependencies) {
        const { result, changes: devChanges } = transformDependencies(pkg.devDependencies)
        if (devChanges.length > 0) {
          pkg.devDependencies = result
          changes.push(...devChanges.map((c) => `devDependencies: ${c}`))
        }
      }

      if (pkg.peerDependencies) {
        const { result, changes: peerChanges } = transformDependencies(pkg.peerDependencies)
        if (peerChanges.length > 0) {
          pkg.peerDependencies = result
          changes.push(...peerChanges.map((c) => `peerDependencies: ${c}`))
        }
      }

      // 8. Inject Strata-specific dependencies
      const strataDeps = STRATA_DEPENDENCIES[path]
      if (strataDeps) {
        pkg.dependencies = pkg.dependencies || {}
        for (const [name, version] of Object.entries(strataDeps)) {
          if (!pkg.dependencies[name]) {
            pkg.dependencies[name] = version
            changes.push(`injected: ${name}`)
          }
        }
      }

      // 9. Set Strata-specific bin entries
      const strataBin = STRATA_BIN[path]
      if (strataBin) {
        pkg.bin = strataBin
        changes.push(`bin: set Strata bin entries`)
      }

      if (changes.length > 0) {
        if (!options.dryRun) {
          const newContent = JSON.stringify(pkg, null, 2) + "\n"
          await Bun.write(path, newContent)
          success(`Transformed ${path}: ${changes.length} changes`)
        } else {
          info(`[DRY-RUN] Would transform ${path}: ${changes.length} changes`)
        }
      }

      results.push({ file: path, action: "transformed", changes, dryRun: options.dryRun ?? false })
    } catch (err) {
      warn(`Failed to transform ${path}: ${err}`)
      results.push({ file: path, action: "failed", changes: [], dryRun: options.dryRun ?? false })
    }
  }

  return results
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const verbose = args.includes("--verbose")

  const files = args.filter((a) => !a.startsWith("--"))

  if (files.length === 0) {
    info("Usage: transform-package-json.ts [--dry-run] [--verbose] <file1> <file2> ...")
    process.exit(1)
  }

  if (dryRun) {
    info("Running in dry-run mode")
  }

  const results = await transformConflictedPackageJson(files, { dryRun, verbose })

  const transformed = results.filter((r) => r.action === "transformed")
  const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0)

  console.log()
  success(`Transformed ${transformed.length} package.json files with ${totalChanges} changes`)

  if (dryRun) {
    info("Run without --dry-run to apply changes")
  }
}
