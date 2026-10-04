import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

/**
 * Regression coverage for the dashboard UI bugs clustered in #407.
 */
test.describe("dashboard UI fixes", () => {
  test("only the longest matching sidebar route is highlighted", async ({ page }) => {
    await page.goto("/dashboard/timecards/mine");
    await expect(page.getByRole("heading", { name: "Timecards" })).toBeVisible({
      timeout: 30_000,
    });

    // "My timecards" (/dashboard/timecards/mine, under My work) wins over
    // "Crew timecards" (/dashboard/timecards, under Ops Center), even across
    // sections, and Home doesn't read active on every page.
    const mine = page.locator('a[href="/dashboard/timecards/mine"]').first();
    await expect(mine).toHaveAttribute("data-active", "true", { timeout: 30_000 });
    // Ops Center stays collapsed here, so only check nothing else is highlighted.
    await expect(page.locator('a[href="/dashboard/timecards"][data-active="true"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard"][data-active="true"]')).toHaveCount(0);
  });

  test("crew scheduling counts slots-less events as needing crew", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E No Slots ${Date.now()}`,
    }) as { eventId: string };

    await page.goto("/dashboard/events/crew-scheduling");
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });

    // A seeded event has sections but no staffing slots, so it must land in
    // "Events needing crew" and be surfaced as "with no slots yet" — it is not
    // a 100%-filled event.
    const eventsNeedingCrew = page
      .locator("div")
      .filter({ hasText: /^Events needing crew/ })
      .last();
    await expect(eventsNeedingCrew.getByText(/^[1-9]\d*$/)).toBeVisible({ timeout: 30_000 });
    await expect(eventsNeedingCrew.getByText(/with no slots yet/)).toBeVisible({
      timeout: 30_000,
    });

    expect(seeded.eventId).toBeTruthy();
  });
});
