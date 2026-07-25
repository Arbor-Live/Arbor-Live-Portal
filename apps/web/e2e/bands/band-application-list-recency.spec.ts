import { test, expect } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * Same defect as the crew queue: the status-filtered branch of
 * `bandApplications.listAdmin` read `by_status`, which has no time component,
 * so the default "submitted" view could miss the newest applications.
 */
const APPLICATION_COUNT = 250;

test.describe("band application list recency", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["bandApplications"]);
  });

  test("shows the newest submitted application past the cap", async ({ page }) => {
    test.setTimeout(300_000);

    seedBulk("seedBandApplications", stamp, APPLICATION_COUNT);
    const target = newestLabel(stamp, APPLICATION_COUNT);

    // The page defaults to the "submitted" filter — the branch under test.
    await page.goto("/dashboard/users/band-applications");
    await expect(page.getByText(target).first()).toBeVisible({ timeout: 40_000 });
  });
});
