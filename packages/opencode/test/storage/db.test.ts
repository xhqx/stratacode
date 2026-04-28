import { describe, expect, test } from "bun:test"
import path from "path"
import { Flag } from "../../src/flag/flag" // stratacode_change
import { Global } from "../../src/global"
import { InstallationChannel } from "../../src/installation/version"
import { Database } from "../../src/storage"

describe("Database.Path", () => {
  test("returns database path for the current channel", () => {
    // stratacode_change start — test preload sets STRATA_DB=:memory:
    if (Flag.STRATA_DB) {
      const expected =
        Flag.STRATA_DB === ":memory:" || path.isAbsolute(Flag.STRATA_DB)
          ? Flag.STRATA_DB
          : path.join(Global.Path.data, Flag.STRATA_DB)
      expect(Database.Path).toBe(expected)
      return
    }
    // stratacode_change end
    const expected = ["latest", "beta"].includes(InstallationChannel)
      ? path.join(Global.Path.data, "strata.db")
      : path.join(Global.Path.data, `opencode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
    expect(Database.getChannelPath()).toBe(expected)
  })
})
