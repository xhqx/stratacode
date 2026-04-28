import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}
// stratacode_change start
const env = {
  STRATA_CHANNEL: process.env["STRATA_CHANNEL"],
  STRATA_BUMP: process.env["STRATA_BUMP"],
  STRATA_VERSION: process.env["STRATA_VERSION"],
  STRATA_RELEASE: process.env["STRATA_RELEASE"],
  STRATA_PRE_RELEASE: process.env["STRATA_PRE_RELEASE"],
}
// stratacode_change end
const CHANNEL = await (async () => {
  if (env.STRATA_CHANNEL) return env.STRATA_CHANNEL // stratacode_change
  // stratacode_change start - publish to "rc" channel for pre-releases
  if (env.STRATA_PRE_RELEASE === "true") return "rc"
  // stratacode_change end
  if (env.STRATA_BUMP) return "latest" // stratacode_change
  if (env.STRATA_VERSION && !env.STRATA_VERSION.startsWith("0.0.0-")) return "latest" // stratacode_change
  return await $`git branch --show-current`.text().then((x) => x.trim().replace(/[^0-9A-Za-z-]/g, "-")) // stratacode_change
})()
const IS_PREVIEW = CHANNEL !== "latest"

// stratacode_change start - shared helpers for version computation
function parseVersion(input: string) {
  const match = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    value: `${match[1]}.${match[2]}.${match[3]}`,
  }
}

function compareVersion(
  a: NonNullable<ReturnType<typeof parseVersion>>,
  b: NonNullable<ReturnType<typeof parseVersion>>,
) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

async function fetchLatest() {
  const data: any = await fetch("https://registry.npmjs.org/@stratacode/cli/latest").then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  })
  return data.version as string
}

async function fetchHighest() {
  if (!process.env.GH_REPO) return fetchLatest()
  const data: { tagName: string }[] = await $`gh release list --json tagName --limit 100 --repo ${process.env.GH_REPO}`
    .json()
    .catch(() => [])
  const versions = data.flatMap((item) => {
    const version = parseVersion(item.tagName)
    if (!version) return []
    return [version]
  })
  const highest = versions.sort(compareVersion).at(-1)
  if (highest) return highest.value
  return fetchLatest()
}

function bumpVersion(current: string, type: string) {
  const version = parseVersion(current)
  if (!version) throw new Error(`Invalid version: ${current}`)
  if (type === "major") return `${version.major + 1}.0.0`
  if (type === "minor") return `${version.major}.${version.minor + 1}.0`
  return `${version.major}.${version.minor}.${version.patch + 1}`
}
// stratacode_change end

const VERSION = await (async () => {
  if (env.STRATA_VERSION) return env.STRATA_VERSION
  if (IS_PREVIEW) {
    // stratacode_change start - rc releases use plain semver required by VS Code Marketplace
    if (env.STRATA_BUMP && env.STRATA_PRE_RELEASE === "true") {
      const current = await fetchHighest()
      return bumpVersion(current, env.STRATA_BUMP.toLowerCase())
    }
    // stratacode_change end
    return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  }
  const version = await fetchHighest() // stratacode_change
  return bumpVersion(version, env.STRATA_BUMP?.toLowerCase() ?? "patch") // stratacode_change
})()

// stratacode_change start
const team = [
  "actions-user",
  "strata-maintainer[bot]",
  "strataconnect[bot]",
  "strataconnect-lite[bot]",
  "alexkgold",
  "arimesser",
  "arkadiykondrashov",
  "bturcotte520",
  "catrielmuller",
  "chrarnoldus",
  "codingelves",
  "darkogj",
  "dependabot[bot]",
  "dosire",
  "DScdng",
  "emilieschario",
  "eshurakov",
  "Helix-Strata",
  "iscekic",
  "jeanduplessis",
  "jobrietbergen",
  "jrf0110",
  "johnnyeric",
  "alex-alecu",
  "imanolmzd-svg",
  "stratacode-bot",
  "strata-code-bot",
  "strata-code-bot[bot]",
  "kirillk",
  "lambertjosh",
  "LigiaZ",
  "marius-stratacode",
  "markijbema",
  "olearycrew",
  "pandemicsyn",
  "pedroheyerdahl",
  "RSO",
  "sbreitenother",
  "suhailkc2025",
  "Sureshkumars",
]
// stratacode_change end

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.STRATA_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`strata script`, JSON.stringify(Script, null, 2)) // stratacode_change
