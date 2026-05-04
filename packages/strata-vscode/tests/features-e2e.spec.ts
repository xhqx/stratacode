import { test, expect, type Page } from "@playwright/test"

const GLOBALS = "colorScheme:dark;theme:strata-vscode;vscodeTheme:dark-modern"

function storyUrl(id: string) {
  return `/iframe.html?id=${id}&viewMode=story&globals=${GLOBALS}`
}

async function disableAnimations(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  })
}

// ─── postMessage spy ──────────────────────────────────────────────────────────
let messages: any[] = []

test.beforeEach(async ({ page }) => {
  messages = []
  page.on("console", async (msg) => {
    const text = msg.text()
    if (msg.type() === "error" || msg.type() === "warning" || text.includes("Error")) {
      console.log(`[Browser ${msg.type()}] ${text}`)
    }
    if (text.includes("Mock postMessage:")) {
      const args = msg.args()
      if (args.length > 1) {
        try {
          const payload = await args[1].jsonValue()
          messages.push(payload)
        } catch (e) {}
      }
    }
  })
  await page.setViewportSize({ width: 800, height: 600 })
})

// ─── Feature registry (mirrors feature-registry.ts) ──────────────────────────
const FEATURE_KEYS = [
  "acpAgents",
  "agentManager",
  "autoApprove",
  "autocomplete",
  "autoretries",
  "batchTool",
  "browserAutomation",
  "checkpoints",
  "codeActions",
  "codebaseSearch",
  "commitMessage",
  "compaction",
  "diffViewer",
  "documentDrivenTasks",
  "explainer",
  "formatter",
  "kanban",
  "lsp",
  "notifications",
  "pasteSummary",
  "planningMode",
  "projectMemory",
  "promptAutocomplete",
  "promptEnhancer",
  "promptEnhancerSuggestions",
  "remoteControl",
  "selectionTip",
  "sessionSharing",
  "taskTimeline",
  "workers",
]

// Features that have a sub-component rendered below the toggle.
// When ON the panel `[data-testid="feature-panel-{key}"]` is visible.
const FEATURES_WITH_PANEL = new Set([
  "acpAgents",
  "agentManager",
  "autoApprove",
  "autocomplete",
  "autoretries",
  "browserAutomation",
  "checkpoints",
  "codeActions",
  "commitMessage",
  "compaction",
  "diffViewer",
  "documentDrivenTasks",
  "explainer",
  "kanban",
  "lsp",
  "notifications",
  "pasteSummary",
  "projectMemory",
  "remoteControl",
  "sessionSharing",
  "workers",
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Click the nth sidebar button and wait for the right-pane switch to appear. */
async function selectFeature(page: Page, index: number) {
  const btn = page.getByTestId("feature-sidebar-button").nth(index)
  await btn.click()
  const toggle = page.getByTestId("master-feature-switch").first()
  await expect(toggle).toBeVisible()
  return toggle
}

// ─── Navigation ───────────────────────────────────────────────────────────────
test.describe("Features Settings — Navigation", () => {
  const STORY = "settings-features--features-default"

  test("Left-pane buttons exist for all features", async ({ page }) => {
    await page.goto(storyUrl(STORY), { waitUntil: "load" })
    await disableAnimations(page)
    const buttons = page.getByTestId("feature-sidebar-button")
    await expect(buttons).toHaveCount(FEATURE_KEYS.length)
  })

  test("Clicking left-pane button changes active feature", async ({ page }) => {
    await page.goto(storyUrl(STORY), { waitUntil: "load" })
    await disableAnimations(page)
    // Click the third button (autoApprove)
    await selectFeature(page, 2)
    await expect(page.locator("h2")).toHaveText("Auto-Approve")
  })
})

// ─── Toggle OFF (start all-on) ───────────────────────────────────────────────
// Verifies: postMessage dispatched with value:false, sub-component unmounts.
test.describe("Features Settings — Toggle OFF", () => {
  const STORY = "settings-features--features-all-on"

  for (const feature of FEATURE_KEYS) {
    test(`${feature}: toggle OFF dispatches postMessage and unmounts panel`, async ({ page }) => {
      await page.goto(storyUrl(STORY), { waitUntil: "load" })
      await disableAnimations(page)

      const index = FEATURE_KEYS.indexOf(feature)
      const toggle = await selectFeature(page, index)

      // If this feature has a sub-component, it should be visible while ON
      if (FEATURES_WITH_PANEL.has(feature)) {
        const panel = page.getByTestId(`feature-panel-${feature}`)
        await expect(panel).toBeVisible()
      }

      messages = []
      await toggle.locator("input").click({ force: true })
      await page.waitForTimeout(50)

      // Assert updateSetting postMessage dispatched (sub-components may fire requestSetting on mount/unmount)
      const updates = messages.filter((m) => m.type === "updateSetting")
      expect(updates).toHaveLength(1)
      expect(updates[0]).toEqual({
        type: "updateSetting",
        key: `features.${feature}`,
        value: false,
      })

      // Assert sub-component unmounted
      if (FEATURES_WITH_PANEL.has(feature)) {
        const panel = page.getByTestId(`feature-panel-${feature}`)
        await expect(panel).not.toBeVisible()
      }
    })
  }
})

// ─── Toggle ON (start all-off) ───────────────────────────────────────────────
// Verifies: postMessage dispatched with value:true, sub-component mounts.
test.describe("Features Settings — Toggle ON", () => {
  const STORY = "settings-features--features-all-off"

  for (const feature of FEATURE_KEYS) {
    test(`${feature}: toggle ON dispatches postMessage and mounts panel`, async ({ page }) => {
      await page.goto(storyUrl(STORY), { waitUntil: "load" })
      await disableAnimations(page)

      const index = FEATURE_KEYS.indexOf(feature)
      const toggle = await selectFeature(page, index)

      // If this feature has a sub-component, it should NOT be visible while OFF
      if (FEATURES_WITH_PANEL.has(feature)) {
        const panel = page.getByTestId(`feature-panel-${feature}`)
        await expect(panel).not.toBeVisible()
      }

      messages = []
      await toggle.locator("input").click({ force: true })
      await page.waitForTimeout(50)

      // Assert updateSetting postMessage dispatched (sub-components may fire requestSetting on mount)
      const updates = messages.filter((m) => m.type === "updateSetting")
      expect(updates).toHaveLength(1)
      expect(updates[0]).toEqual({
        type: "updateSetting",
        key: `features.${feature}`,
        value: true,
      })

      // Assert sub-component mounted
      if (FEATURES_WITH_PANEL.has(feature)) {
        const panel = page.getByTestId(`feature-panel-${feature}`)
        await expect(panel).toBeVisible()
      }
    })
  }
})

// ─── Deep Linking ─────────────────────────────────────────────────────────────
test.describe("Features Settings — Deep Linking", () => {
  test("Navigates directly to autocomplete via deep link", async ({ page }) => {
    await page.goto(storyUrl("settings-features--features-deep-link"), { waitUntil: "load" })
    await disableAnimations(page)
    // The first h2 is the global "Settings" header. The active feature header is the second one.
    const title = page.locator("h2").nth(1)
    await expect(title).toHaveText("Autocomplete")
  })
})
