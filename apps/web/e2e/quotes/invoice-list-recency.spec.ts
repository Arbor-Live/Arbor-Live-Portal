import { test, expect } from "@playwright/test";
import { newestLabel, purgeBulk, seedBulk, bulkStamp } from "../helpers/bulk-seed";

/**
 * `invoices.listEnriched` took 200 rows in index order and only then sorted by
 * recency, so past 200 invoices new ones stopped appearing on a billing surface.
 */
const INVOICE_COUNT = 250;

test.describe("invoice list recency", () => {
  const stamp = bulkStamp();

  test.afterAll(() => {
    purgeBulk(stamp, ["invoices"]);
  });

  test("shows the newest invoice past the 200-row cap", async ({ page }) => {
    test.setTimeout(300_000);

    seedBulk("seedInvoices", stamp, INVOICE_COUNT);
    const target = newestLabel(stamp, INVOICE_COUNT);

    await page.goto("/dashboard/financial-hub/invoices");
    await page.getByPlaceholder("Invoice, client, series…").fill(target);

    const invoiceNumber = `ALINV-BULK-${stamp}-${INVOICE_COUNT - 1}`;
    const row = page.getByRole("row").filter({ hasText: target });
    await expect(row).toBeVisible({ timeout: 40_000 });
    // The row is built from a slim projection now — check its columns survived.
    await expect(row).toContainText(invoiceNumber);
    await expect(row).toContainText("Draft");
    // Rows open the editor on click (no separate Open link).
    await row.getByText(invoiceNumber).click();
    await expect(page).toHaveURL(/\/dashboard\/financial-hub\/invoices\/[^/]+$/, {
      timeout: 25_000,
    });
  });
});
