import { test, expect } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * `damageReports.list` read its status branch off `by_status` and took 500 rows
 * before sorting by `reportedAt`, so the default "open" queue could hide the
 * newest reports. The cap here is 500, hence the larger batch.
 */
const REPORT_COUNT = 520;

test.describe("damage queue recency", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["damageReports", "inventoryItems", "inventoryTypes"]);
  });

  test("shows the newest open report past the 500-row cap", async ({ page }) => {
    test.setTimeout(420_000);

    seedBulk("seedDamageReports", stamp, REPORT_COUNT);
    const target = newestLabel(stamp, REPORT_COUNT);

    // The page defaults to the "open" filter — the branch under test.
    await page.goto("/dashboard/inventory/damage");
    // The sidebar link carries the same text, so target the page heading.
    await expect(page.getByRole("heading", { name: "Damage & repair" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(target).first()).toBeVisible({ timeout: 60_000 });
  });
});
