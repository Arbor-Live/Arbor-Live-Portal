import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("staff payment proof verify", () => {
  test("admin marks payment received from the Payments tab", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {}) as {
      invoiceId: string;
      invoiceNumber: string;
    };

    await page.goto("/dashboard/financial-hub/invoices/payments");
    const row = page.getByTestId("payment-group-pending").getByTestId(`payment-row-${seeded.invoiceId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Mark received", exact: true }).click();

    // It moves to Received (collapsed by default).
    await expect(row).toHaveCount(0, { timeout: 25_000 });
    const received = page.getByTestId("payment-group-received");
    await received.getByRole("button", { name: "Show", exact: true }).click();
    await expect(received.getByTestId(`payment-row-${seeded.invoiceId}`)).toBeVisible({ timeout: 25_000 });

    const state = await pollConvex<{
      paymentReceivedAt: number | null;
      invoiceNumber: string;
    }>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId: seeded.invoiceId },
      (value) => value?.paymentReceivedAt != null,
    );
    expect(state.paymentReceivedAt).toBeTruthy();
    expect(state.invoiceNumber).toBe(seeded.invoiceNumber);
  });

  test("the old Payments URL lands on the Payments tab", async ({ page }) => {
    await page.goto("/dashboard/financial-hub/payments");
    await expect(page).toHaveURL(/\/dashboard\/financial-hub\/invoices\/payments/, { timeout: 30_000 });
    await expect(page.getByTestId("payments-board")).toBeVisible({ timeout: 30_000 });
  });
});
