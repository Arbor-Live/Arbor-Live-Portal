import { test, expect, type Page } from "@playwright/test";
import { measureLongTaskMsDuring } from "../helpers/performance";

async function openEmailStep(page: Page) {
  await page.goto("/request");
  await expect(page.getByText("Welcome!").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Stanford email")).toBeVisible({ timeout: 20_000 });
}

async function assertEmailStepIsLightweight(page: Page) {
  await expect(page.locator("[data-slot=questionnaire-item]")).toHaveCount(1);
  await expect(page.locator(".booking-availability-calendar")).toHaveCount(0);
  await expect(page.locator("[data-slot=calendar]")).toHaveCount(0);
}

test.describe("booking wizard typing performance", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("email typing mounts one step and keeps the schedule calendar unmounted", async ({ page }) => {
    await openEmailStep(page);
    await assertEmailStepIsLightweight(page);

    await page.getByLabel("Stanford email").pressSequentially("you@stanford.edu", { delay: 5 });

    await assertEmailStepIsLightweight(page);
    await expect(page.getByLabel("Stanford email")).toHaveValue("you@stanford.edu");
  });

  test("email keystrokes stay within a long-task budget", async ({ page }) => {
    await openEmailStep(page);

    const longTaskMs = await measureLongTaskMsDuring(page, async () => {
      await page.getByLabel("Stanford email").pressSequentially("you@stanford.edu", { delay: 5 });
    });

    // Before the perf fix this was ~90–210 ms of long tasks per character (16 chars → seconds).
    // Fixed path should stay well under one second total in CI headless Chrome.
    expect(longTaskMs).toBeLessThan(900);
  });
});
