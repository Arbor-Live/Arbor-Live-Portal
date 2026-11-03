import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("staff payment proof verify", () => {
  test("admin marks payment received from the Payments tab", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {}) as {
      invoiceId: string;
      invoiceNumber: string;
    };

    await page.goto("/dashboard/ops-center/invoices/payments");
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
    // This URL is a redirect hop (it server-redirects onto the Payments tab,
    // and pre-rename financial-hub URLs 308 into the same chain), so `goto`'s
    // own wait settles whichever document answered first. Start the
    // navigation and let toHaveURL wait for the FINAL url instead — the tab
    // content can only render there.
    await page.goto("/dashboard/ops-center/payments", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/dashboard\/ops-center\/invoices\/payments/, { timeout: 30_000 });
    await expect(page.getByTestId("payments-board")).toBeVisible({ timeout: 30_000 });
  });
});
