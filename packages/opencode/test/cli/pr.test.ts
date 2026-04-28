// stratacode_change - new file
import { expect, test } from "bun:test"
import { cliCommand } from "../../src/cli/cmd/pr"

test("cliCommand uses the current script when argv[1] is a file path", () => {
  const result = cliCommand({
    execPath: "/usr/bin/node",
    argv: ["/usr/bin/node", "/tmp/strata.js", "pr", "1"],
    exists: (file) => file === "/tmp/strata.js",
  })

  expect(result).toEqual(["/usr/bin/node", "/tmp/strata.js"])
})

test("cliCommand falls back to execPath when argv[1] is a subcommand", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/strata",
    argv: ["/usr/local/bin/strata", "pr", "1"],
    exists: () => false,
  })

  expect(result).toEqual(["/usr/local/bin/strata"])
})

test("cliCommand ignores subcommand token even when it exists on disk", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/strata",
    argv: ["/usr/local/bin/strata", "pr", "1"],
    exists: (file) => file === "pr",
  })

  expect(result).toEqual(["/usr/local/bin/strata"])
})

test("cliCommand falls back to execPath when argv[1] is missing", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/strata",
    argv: ["/usr/local/bin/strata"],
    exists: () => false,
  })

  expect(result).toEqual(["/usr/local/bin/strata"])
})

test("cliCommand falls back to execPath for bun virtual script paths", () => {
  const unix = cliCommand({
    execPath: "/tmp/strata",
    argv: ["/tmp/strata", "/$bunfs/root/src/index.js", "pr", "1"],
    exists: () => true,
  })

  const win = cliCommand({
    execPath: "C:/tmp/strata.exe",
    argv: ["C:/tmp/strata.exe", "B:/~BUN/root/src/index.js", "pr", "1"],
    exists: () => true,
  })

  expect(unix).toEqual(["/tmp/strata"])
  expect(win).toEqual(["C:/tmp/strata.exe"])
})
