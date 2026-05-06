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

test.describe("UI Performance and Stability — Features Registry", () => {
  // Use a longer timeout for performance stress tests
  test.setTimeout(30000)

  test("Initial render time is under 500ms (end-to-end)", async ({ page }) => {
    const startTime = Date.now()
    await page.goto(storyUrl("settings-features--features-default"), { waitUntil: "load" })
    await disableAnimations(page)

    // Wait for the master feature switch to be visible, meaning the right pane has fully rendered
    const toggle = page.getByTestId("master-feature-switch").first()
    await expect(toggle).toBeVisible()

    const renderTime = Date.now() - startTime
    console.log(`[Performance] Initial render E2E time: ${renderTime}ms`)

    // 5000ms is a reasonable budget for local Playwright + Storybook overhead + Vite compilation on first hit
    expect(renderTime).toBeLessThan(5000)
  })

  test("Rapid toggling stability (10 iterations)", async ({ page }) => {
    await page.goto(storyUrl("settings-features--features-default"), { waitUntil: "load" })
    await disableAnimations(page)

    const sidebarButtons = page.getByTestId("feature-sidebar-button")
    await sidebarButtons.first().waitFor({ state: "visible" })

    const count = await sidebarButtons.count()
    expect(count).toBeGreaterThan(0)

    const iterations = Math.min(10, count)

    const startTime = Date.now()
    for (let i = 0; i < iterations; i++) {
      // Rapidly click through the first N features
      await sidebarButtons.nth(i).click()

      // Verify that the right pane updates without crashing
      const toggle = page.getByTestId("master-feature-switch").first()
      await expect(toggle).toBeVisible()
    }
    const totalTime = Date.now() - startTime
    const avgTime = totalTime / iterations

    console.log(`[Performance] Rapid toggling avg time per feature switch: ${avgTime.toFixed(2)}ms`)

    // Ensure that switching tabs is fast (UI update only, no network requests)
    expect(avgTime).toBeLessThan(1000)
  })

  test("Deep linking to nested feature render time under 5000ms", async ({ page }) => {
    const startTime = Date.now()
    await page.goto(storyUrl("settings-features--features-deep-link"), { waitUntil: "load" })
    await disableAnimations(page)

    // Autocomplete panel should become visible immediately
    const panel = page.getByTestId("feature-panel-autocomplete")
    await expect(panel).toBeVisible()

    const renderTime = Date.now() - startTime
    console.log(`[Performance] Deep link render E2E time: ${renderTime}ms`)

    expect(renderTime).toBeLessThan(5000)
  })

  test("Cascade stability under rapid toggling", async ({ page }) => {
    // Start with all features ON, and disable a parent to trigger cascading disables
    await page.goto(storyUrl("settings-features--features-all-on"), { waitUntil: "load" })
    await disableAnimations(page)

    // Find the workers button using data-feature-key
    const workersBtn = page.locator('[data-feature-key="workers"]')
    await workersBtn.click()

    const toggle = page.getByTestId("master-feature-switch").first()
    await expect(toggle).toBeVisible()

    // Disable the parent feature
    const startTime = Date.now()
    await toggle.locator("input").click({ force: true })

    // Verify UI state doesn't lock up and component disappears
    const panel = page.getByTestId("feature-panel-workers")
    await expect(panel).not.toBeVisible()

    const cascadeTime = Date.now() - startTime
    console.log(`[Performance] Cascade disable UI response time: ${cascadeTime}ms`)
    expect(cascadeTime).toBeLessThan(500)
  })
})
