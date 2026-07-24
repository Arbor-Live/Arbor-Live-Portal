import { test, expect } from "@playwright/test";
import { fillDateTimeNearLabel } from "../helpers/auth";

test.describe("event create smoke", () => {
  test("admin can create a crewed event and quick-add schedule", async ({ page }) => {
    const title = `E2E Event ${Date.now()}`;
    // Prefer a late-month day still in the open calendar month.
    const now = new Date();
    const dayLabel = String(Math.min(28, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));

    await page.goto("/dashboard/events/new");
    await expect(page.getByText("Create Event").first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox")
      .fill(title);

    await fillDateTimeNearLabel(page, "Start", { dayLabel, timeLabel: "6:00 PM" });
    await fillDateTimeNearLabel(page, "End", { dayLabel, timeLabel: "10:00 PM" });

    await page.getByRole("button", { name: "Create Event" }).first().click();
    await page.waitForURL(/\/dashboard\/events\/(?!new(?:\/|$))[^/?#]+/, { timeout: 45_000 });
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .locator("div.space-y-1")
        .filter({ has: page.getByText("Title", { exact: true }) })
        .getByRole("textbox"),
    ).toHaveValue(title);

    const eventUrl = page.url().replace(/\/$/, "").replace(/\/schedule$/, "");
    await page.goto(`${eventUrl}/schedule`);
    const quickAdd = page.getByRole("button", { name: /Quick Add:/ });
    await expect(quickAdd).toBeVisible({ timeout: 20_000 });
    // Schedule tab hydrates start/end from the event query before Quick Add enables.
    await expect(quickAdd).toBeEnabled({ timeout: 30_000 });
    await quickAdd.click();
    await page.getByRole("button", { name: /Save Schedule/ }).first().click();
    await expect(page.getByText(/Setup|Show|Strike/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
