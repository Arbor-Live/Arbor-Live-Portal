import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("staff payment proof verify", () => {
  test("admin marks payment received from financial hub queue", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {}) as {
      invoiceId: string;
      invoiceNumber: string;
    };

    await page.goto("/dashboard/financial-hub/payments");
    await expect(page.getByRole("button", { name: "Payment pending", exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("button", { name: "Payment pending", exact: true }).click();

    const card = page.locator("[data-slot='card']").filter({ hasText: seeded.invoiceNumber });
    await expect(card.getByText(seeded.invoiceNumber).first()).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Mark payment received", exact: true }).click();

    await page.getByRole("button", { name: "Payment received", exact: true }).click();
    await expect(
      page.locator("[data-slot='card']").filter({ hasText: seeded.invoiceNumber }),
    ).toBeVisible({ timeout: 25_000 });

    const state = await pollConvex<{
      paymentReceivedAt: number | null;
      invoiceNumber: string;
    }>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.paymentReceivedAt != null,
    );
    expect(state.paymentReceivedAt).toBeTruthy();
    expect(state.invoiceNumber).toBe(seeded.invoiceNumber);
  });
});
