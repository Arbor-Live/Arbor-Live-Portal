import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

type SeededShift = {
  eventId: string;
  title: string;
  hours: number;
  periodLabel: string;
};

/**
 * Timecards are derived from `eventCrewShifts` — the app has no submit
 * mutation, so this covers the read path both crew and admins rely on.
 */
test.describe("crew timecard view", () => {
  test.use({ storageState: crewAuthFile });

  test("crew sees a worked shift on their timecard", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedTimecardShift", {
      userId: crew.userId,
      title: `E2E Timecard ${Date.now()}`,
    }) as SeededShift;
    expect(seeded.hours).toBeGreaterThan(0);

    await page.goto("/dashboard/timecards/mine");
    await expect(page.getByRole("heading", { name: "Timecards" })).toBeVisible({
      timeout: 30_000,
    });

    // The seeded shift lands in the current period, which is listed first.
    const period = page.locator('[data-slot="card"]').first();
    await expect(period.getByText(/1 days worked/)).toBeVisible({ timeout: 30_000 });

    // Event titles only render once the period is expanded.
    await period.getByRole("button", { name: "Show day-by-day details" }).click();
    await expect(page.getByText(seeded.title).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("admin timecards overview", () => {
  test("admin sees the crew member on the timecards overview", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    runConvex("e2eHelpers:seedTimecardShift", {
      userId: crew.userId,
      title: `E2E Timecard Admin ${Date.now()}`,
    });

    await page.goto("/dashboard/timecards");
    await expect(page.getByRole("heading", { name: "Crew Timecards" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(e2eEnv.crewName).first()).toBeVisible({ timeout: 30_000 });
  });
});
