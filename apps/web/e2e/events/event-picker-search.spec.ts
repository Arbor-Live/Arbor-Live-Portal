import { test, expect } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * The event picker used to preload `events.list`, which capped at 200 rows.
 * Past that cap the newest events were unreachable no matter what was typed —
 * this seeds past the cap and asserts the newest event is still findable.
 */
const EVENT_COUNT = 250;

test.describe("event picker search-on-demand", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["events"]);
  });

  test("finds an event created well past the old 200-row list cap", async ({ page }) => {
    test.setTimeout(300_000);

    seedBulk("seedEvents", stamp, EVENT_COUNT);
    const target = newestLabel(stamp, EVENT_COUNT);

    await page.goto("/dashboard/marketing/links");
    await expect(page.getByText("Short links").first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "New" }).click();

    await page.getByTestId("searchable-select-trigger").click();
    const search = page.getByPlaceholder("Search events…");
    await expect(search).toBeVisible({ timeout: 15_000 });

    // Below the minimum query length the picker must stay empty rather than
    // falling back to a preloaded catalog.
    await search.fill("E");
    await expect(page.getByText("Type at least 2 characters to search")).toBeVisible();

    await search.fill(target);
    await expect(page.getByRole("button", { name: target })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: target }).click();
    await expect(page.getByTestId("searchable-select-trigger")).toContainText(target, {
      timeout: 15_000,
    });
  });
});
