import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import {
  invoiceIdFromUrl,
  readTotal,
  saveInvoiceEditor,
  waitForInvoiceEditorUrl,
} from "../helpers/invoice";

type TotalsState = {
  artistsSubtotalUsd: number;
  externalRentalsSubtotalUsd: number;
  feesSubtotalUsd: number;
  subtotalUsd: number;
  totalUsd: number;
  lineItems: Array<{ section: string; label: string; quantity: number; rateUsd: number; amountUsd: number }>;
};

/**
 * Line-item editing across three sections, asserted against the server totals.
 *
 * The editor computes the panel total in the browser with
 * `computeInvoiceDraftTotals`, and `invoices.computeTotals` recomputes it again
 * on save. Those are two separate implementations of the same arithmetic, so
 * this spec checks the DOM figure *and* the persisted figure — a drift between
 * them is the failure mode a DOM-only assertion would sail straight past.
 *
 * Artist / external rental / fee lines are used on purpose: their rate passes
 * through untouched. Equipment lines resolve their rate from catalog rows and
 * crew lines from the global `invoiceSettings`, both of which other worktrees
 * sharing this deployment can change mid-run.
 */
test.describe("invoice line items and totals", () => {
  test("admin adds, edits, and removes line items with totals staying consistent", async ({ page }) => {
    const stamp = Date.now();
    const artistLabel = `E2E Artist ${stamp}`;
    const rentalLabel = `E2E Rental ${stamp}`;
    const feeLabel = `E2E Fee ${stamp}`;

    await page.goto("/dashboard/financial-hub/invoices/new");
    await expect(page.getByText("Create Invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    // 2 people × 1 hr × $75 = $150
    await page.getByRole("button", { name: "Add artist row" }).click();
    const artistRow = page.getByTestId("invoice-row-artist-0");
    await artistRow.getByPlaceholder("Artist / role").fill(artistLabel);
    await artistRow.getByPlaceholder("Hours").fill("1");
    await artistRow.getByPlaceholder("People").fill("2");
    await artistRow.getByPlaceholder("Rate / hr").fill("75");

    // 1 x $40 = $40
    await page.getByRole("button", { name: "Add external rental" }).click();
    const rentalRow = page.getByTestId("invoice-row-external-rental-0");
    await rentalRow.getByPlaceholder("Provider").fill("E2E Provider");
    await rentalRow.getByPlaceholder("Line item").fill(rentalLabel);
    await rentalRow.getByPlaceholder("Qty").fill("1");
    await rentalRow.getByPlaceholder("Rate").fill("40");

    // 3 x $10 = $30
    await page.getByRole("button", { name: "Add fee" }).click();
    const feeRow = page.getByTestId("invoice-row-fee-0");
    await feeRow.getByPlaceholder("Label").fill(feeLabel);
    await feeRow.getByPlaceholder("Qty").fill("3");
    await feeRow.getByPlaceholder("Rate").fill("10");

    // Client-side panel first.
    await expect
      .poll(() => readTotal(page, "invoice-total-subtotal"), { timeout: 15_000 })
      .toBe(220);
    expect(await readTotal(page, "invoice-total-artists")).toBe(150);
    expect(await readTotal(page, "invoice-total-external")).toBe(40);
    expect(await readTotal(page, "invoice-total-fees")).toBe(30);
    expect(await readTotal(page, "invoice-total-grand")).toBe(220);

    await saveInvoiceEditor(page);
    await waitForInvoiceEditorUrl(page);
    const invoiceId = invoiceIdFromUrl(page);

    // Then the server's independent recomputation of the same numbers.
    const saved = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => (row?.lineItems.length ?? 0) === 3,
    );
    expect(saved.artistsSubtotalUsd).toBe(150);
    expect(saved.externalRentalsSubtotalUsd).toBe(40);
    expect(saved.feesSubtotalUsd).toBe(30);
    expect(saved.subtotalUsd).toBe(220);
    expect(saved.totalUsd).toBe(220);

    const artistLine = saved.lineItems.find((line) => line.label === artistLabel);
    expect(artistLine).toBeTruthy();
    expect(artistLine!.quantity).toBe(2);
    expect(artistLine!.rateUsd).toBe(75);
    expect(artistLine!.amountUsd).toBe(150);

    // Edit an existing line: 2 -> 4 artists doubles that section to $300.
    await page.getByTestId("invoice-row-artist-0").getByPlaceholder("People").fill("4");
    await expect
      .poll(() => readTotal(page, "invoice-total-artists"), { timeout: 15_000 })
      .toBe(300);

    // Remove the fee line entirely.
    await page.getByTestId("invoice-row-fee-0").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("invoice-row-fee-0")).toHaveCount(0);
    await expect
      .poll(() => readTotal(page, "invoice-total-subtotal"), { timeout: 15_000 })
      .toBe(340);

    await saveInvoiceEditor(page);

    const afterEdit = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => (row?.lineItems.length ?? 0) === 2 && row?.subtotalUsd === 340,
    );
    expect(afterEdit.artistsSubtotalUsd).toBe(300);
    expect(afterEdit.feesSubtotalUsd).toBe(0);
    expect(afterEdit.totalUsd).toBe(340);
    expect(afterEdit.lineItems.some((line) => line.label === feeLabel)).toBe(false);
    expect(afterEdit.lineItems.some((line) => line.label === rentalLabel)).toBe(true);
  });
});
