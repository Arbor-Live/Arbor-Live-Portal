import { test, expect } from "@playwright/test";
import { fillDateTimeRangeNearLabel, selectSearchableOption } from "../helpers/auth";
import { runConvex } from "../helpers/convex";

test.describe("event edit and dry hire", () => {
  test("seeded event title edit persists after reload", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Persist ${Date.now()}`,
    }) as { path: string; title: string };

    const nextTitle = `${seeded.title} Updated`;
    await page.goto(seeded.path);
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 45_000 });

    const titleInput = page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox");
    await expect(titleInput).toBeVisible({ timeout: 30_000 });
    await titleInput.fill(nextTitle);
    await page.getByRole("button", { name: "Save Event" }).first().click();
    await expect(page.getByText(/Saved/i).first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 20_000 });
    const titleAfterReload = page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox");
    await expect(titleAfterReload).toHaveValue(nextTitle, { timeout: 30_000 });
  });

  test("admin can create dry hire and quick-add delivery/return", async ({ page }) => {
    const title = `E2E Dry Hire ${Date.now()}`;
    const now = new Date();
    const dayLabel = String(Math.min(28, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));

    await page.goto("/dashboard/events/new");
    await expect(page.getByText("Create Event").first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox")
      .fill(title);

    await selectSearchableOption(page, "Event Type", "Dry Hire");
    await fillDateTimeRangeNearLabel(page, "Start", {
      dayLabel,
      startTime: "10:00 AM",
      endTime: "6:00 PM",
    });

    await page.getByRole("button", { name: "Create Event" }).first().click();
    await page.waitForURL(/\/dashboard\/events\/(?!new(?:\/|$))[^/?#]+/, { timeout: 45_000 });

    const eventUrl = page.url().replace(/\/$/, "").replace(/\/schedule$/, "");
    await page.goto(`${eventUrl}/schedule`);
    const quickAdd = page.getByRole("button", { name: /Quick Add:/ });
    await expect(quickAdd).toBeVisible({ timeout: 20_000 });
    await expect(quickAdd).toBeEnabled({ timeout: 30_000 });
    await quickAdd.click();
    await page.getByRole("button", { name: /Save Schedule/ }).first().click();
    await expect(page.getByText(/Drop-off Window|Pickup Window|Check-out Window|Return Window/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
