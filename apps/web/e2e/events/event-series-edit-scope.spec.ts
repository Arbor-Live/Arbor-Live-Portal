import { test, expect } from "@playwright/test";
import { fillDateTimeNearLabel } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

type SeriesState = {
  seriesId: string;
  occurrenceCount: number;
  occurrenceIds: string[];
};

test.describe("event series edit scope", () => {
  test("save with 'this occurrence only' does not alter sibling occurrences", async ({ page }) => {
    test.setTimeout(180_000);

    const title = `E2E Series Scope ${Date.now()}`;
    const now = new Date();
    const dayLabel = String(
      Math.min(28, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()),
    );

    // --- Create series with 3 occurrences ---
    await page.goto("/dashboard/events/new");
    await expect(page.getByText("Create Event").first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox")
      .fill(title);

    await fillDateTimeNearLabel(page, "Start", { dayLabel, timeLabel: "6:00 PM" });
    await fillDateTimeNearLabel(page, "End", { dayLabel, timeLabel: "10:00 PM" });

    await page.getByText("Recurring event series").click();
    await expect(page.getByText("Weekly").first()).toBeVisible({ timeout: 20_000 });
    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Occurrence count", { exact: true }) })
      .locator("input")
      .fill("3");

    await expect(page.getByText("Preview (3 occurrences)")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Create Series" }).first().click();
    await page.waitForURL(/\/dashboard\/events\/(?!new(?:\/|$))[^/?#]+/, { timeout: 60_000 });
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 25_000 });

    const eventId = page.url().replace(/\/$/, "").split("/").pop()!;
    const series = await pollConvex<SeriesState>(
      "e2eHelpers:getEventSeriesStateByEventId",
      { eventId },
      (row) => (row?.occurrenceCount ?? 0) === 3,
    );

    // --- Navigate to series overview page ---
    await page.getByRole("link", { name: "View series" }).click();
    await page.waitForURL(new RegExp(`/dashboard/events/series/${series.seriesId}`), { timeout: 30_000 });
    await expect(page.getByText("Series schedule template")).toBeVisible({ timeout: 30_000 });

    // --- Step 1: apply blocks to all 3 occurrences via Quick Add + scope "all" ---
    await page.getByRole("button", { name: /Quick Add/ }).click();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(3, { timeout: 15_000 });

    await page.getByRole("button", { name: /Save template.*apply blocks/ }).first().click();

    for (const occId of series.occurrenceIds) {
      await pollConvex<{ count: number }>(
        "e2eHelpers:getEventScheduleBlockCount",
        { eventId: occId },
        (state) => state?.count === 3,
      );
    }

    // --- Step 2: edit with "this occurrence only" scope ---
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(3, { timeout: 15_000 });
    await page.getByRole("button", { name: "Remove" }).nth(2).click();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(2, { timeout: 10_000 });

    const scheduleGrid = page
      .locator('div.grid.gap-3.md\\:grid-cols-3')
      .filter({ has: page.getByRole("button", { name: /Save template.*apply blocks/ }) });

    await pickSearchableOption(
      page,
      scheduleGrid
        .locator('div.space-y-1')
        .filter({ has: page.getByText("Apply to", { exact: true }) })
        .getByTestId("searchable-select-trigger"),
      "This occurrence only",
      "This occurrence only",
    );

    await pickSearchableOption(
      page,
      scheduleGrid
        .locator("div.space-y-1")
        .filter({ has: page.getByText("From occurrence index", { exact: true }) })
        .getByTestId("searchable-select-trigger"),
      "#2",
      "#2",
    );

    await page.getByRole("button", { name: /Save template.*apply blocks/ }).first().click();

    // --- Step 3: assert siblings not affected ---
    await pollConvex<{ count: number }>(
      "e2eHelpers:getEventScheduleBlockCount",
      { eventId: series.occurrenceIds[0] },
      (state) => state?.count === 3,
    );
    await pollConvex<{ count: number }>(
      "e2eHelpers:getEventScheduleBlockCount",
      { eventId: series.occurrenceIds[2] },
      (state) => state?.count === 3,
    );

    await pollConvex<{ count: number }>(
      "e2eHelpers:getEventScheduleBlockCount",
      { eventId: series.occurrenceIds[1] },
      (state) => state?.count === 2,
    );
  });
});
