import { test, expect } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * `crewApplications.listAdmin` ordered its unfiltered branch correctly but read
 * the status branch off `by_status`, which carries no time component — so the
 * default "submitted" view could miss the newest applications entirely.
 */
const APPLICATION_COUNT = 250;

test.describe("crew application list recency", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["crewApplications"]);
  });

  test("shows the newest submitted application past the cap", async ({ page }) => {
    test.setTimeout(300_000);

    seedBulk("seedCrewApplications", stamp, APPLICATION_COUNT);
    const target = newestLabel(stamp, APPLICATION_COUNT);

    // The page defaults to the "submitted" filter — the branch under test.
    await page.goto("/dashboard/users/crew-applications");
    await expect(page.getByText(target).first()).toBeVisible({ timeout: 40_000 });
  });
});
