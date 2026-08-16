import { test, expect } from "@playwright/test";
import { fillDateTimeRangeNearLabel } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";

type SeriesState = {
  seriesId: string;
  title: string;
  intervalWeeks: number;
  occurrenceCount: number;
  occurrenceTitles: string[];
  seriesPath: string;
};

test.describe("event series", () => {
  test("admin can create a weekly series and open the series overview", async ({ page }) => {
    test.setTimeout(150_000);

    const title = `E2E Series ${Date.now()}`;
    const now = new Date();
    // Prefer a late-month day still inside the open calendar month.
    const dayLabel = String(
      Math.min(28, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()),
    );

    await page.goto("/dashboard/events/new");
    await expect(page.getByText("Create Event").first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox")
      .fill(title);

    await fillDateTimeRangeNearLabel(page, "Start", {
      dayLabel,
      startTime: "6:00 PM",
      endTime: "10:00 PM",
    });

    await page.getByText("Recurring event series").click();
    // "Repeat every" already defaults to Weekly and "Ends" to occurrence count.
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
    await expect(page.getByText(/Recurring · occurrence 1 of 3/)).toBeVisible({
      timeout: 25_000,
    });

    const eventId = page.url().replace(/\/$/, "").split("/").pop()!;
    const series = await pollConvex<SeriesState>(
      "e2eHelpers:getEventSeriesStateByEventId",
      { eventId },
      (row) => (row?.occurrenceCount ?? 0) === 3,
    );
    expect(series.title).toBe(title);
    expect(series.intervalWeeks).toBe(1);
    expect(series.occurrenceTitles.every((row) => row === title)).toBe(true);

    await page.getByRole("link", { name: "View series" }).click();
    await page.waitForURL(new RegExp(`/dashboard/events/series/${series.seriesId}`), {
      timeout: 30_000,
    });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
  });
});
