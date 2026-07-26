import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import { createDraftInvoiceWithArtistLine, readTotal, saveInvoiceEditor } from "../helpers/invoice";

type TotalsState = {
  discountType: string;
  discountValue: number;
  discountAmountUsd: number;
  discountWarning: string | null;
  equipmentSubtotalUsd: number;
  subtotalUsd: number;
  totalUsd: number;
};

/**
 * Discount arithmetic and the warning that rides along with it.
 *
 * Two behaviours here are easy to regress and had no coverage: the discount is
 * clamped so a total can never go negative, and the "exceeds equipment rental
 * subtotal" warning compares the discount against the *equipment* subtotal
 * specifically, not the invoice subtotal — an invoice of pure artist lines
 * trips it at any non-zero discount.
 */
test.describe("invoice discounts", () => {
  test("percent discount applies, warns against equipment subtotal, and clamps at zero", async ({
    page,
  }) => {
    const stamp = Date.now();
    const invoiceId = await createDraftInvoiceWithArtistLine(page, {
      label: `E2E Discount Artist ${stamp}`,
      quantity: "1",
      rate: "200",
    });

    // 10% of $200 = $20 off, total $180.
    await page.getByTestId("invoice-discount-type").selectOption("percent");
    await page.getByTestId("invoice-discount-value").fill("10");

    await expect.poll(() => readTotal(page, "invoice-total-grand"), { timeout: 15_000 }).toBe(180);
    expect(await readTotal(page, "invoice-total-discount")).toBe(20);

    // No equipment lines on this invoice, so any discount exceeds $0 of equipment.
    await expect(page.getByTestId("invoice-discount-warning")).toBeVisible({ timeout: 15_000 });

    await saveInvoiceEditor(page);

    const percentSaved = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => row?.discountType === "percent" && row?.totalUsd === 180,
    );
    expect(percentSaved.discountValue).toBe(10);
    expect(percentSaved.discountAmountUsd).toBe(20);
    expect(percentSaved.subtotalUsd).toBe(200);
    expect(percentSaved.equipmentSubtotalUsd).toBe(0);
    expect(percentSaved.discountWarning).toBe("Discount exceeds equipment rental subtotal.");

    // A flat discount larger than the subtotal floors the total at $0 rather
    // than producing a negative invoice.
    await page.getByTestId("invoice-discount-type").selectOption("amount");
    await page.getByTestId("invoice-discount-value").fill("500");

    await expect.poll(() => readTotal(page, "invoice-total-grand"), { timeout: 15_000 }).toBe(0);

    await saveInvoiceEditor(page);

    const clamped = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => row?.discountType === "amount" && row?.discountValue === 500,
    );
    expect(clamped.discountAmountUsd).toBe(500);
    expect(clamped.subtotalUsd).toBe(200);
    expect(clamped.totalUsd).toBe(0);
  });
});
