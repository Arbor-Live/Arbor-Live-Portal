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
    await expect(page.getByRole("heading", { name: "My timecards", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    // The seeded shift lands in the current period, which is listed first,
    // as a row in that period's group.
    const period = page.getByTestId("timecard-period").first();
    await expect(period.getByText(/[1-9]\d* days? worked/)).toBeVisible({ timeout: 30_000 });
    await expect(
      period.getByTestId("timecard-shift-row").filter({ hasText: seeded.title }),
    ).toBeVisible({ timeout: 30_000 });
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
    await expect(page.getByRole("heading", { name: "Crew timecards" })).toBeVisible({
      timeout: 30_000,
    });
    // The seeded shift puts them in a worked group, linking to their timecard.
    const row = page.getByTestId(`timecard-row-${crew.userId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(e2eEnv.crewName);
    await expect(row).not.toContainText(/\b0 days/);
  });

  test("admin opens a crew member's timecard, grouped by pay period", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    const seeded = runConvex("e2eHelpers:seedTimecardShift", {
      userId: crew.userId,
      title: `E2E Timecard Detail ${Date.now()}`,
    }) as SeededShift;

    await page.goto(`/dashboard/users/timecards/${crew.userId}`);
    await expect(page.getByTestId("timecard-detail-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Crew timecards" }).first()).toBeVisible();
    await expect(page.getByTestId("timecard-periods-summary")).toContainText("pay period");
    await expect(
      page.getByTestId("timecard-period").first().getByTestId("timecard-shift-row").filter({
        hasText: seeded.title,
      }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
