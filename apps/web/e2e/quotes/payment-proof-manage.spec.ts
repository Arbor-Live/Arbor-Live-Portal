import { test, expect, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

type ProofState = {
  hasReceipt: boolean;
  paymentReceivedAt: number | null;
  submissions: Array<{
    submissionId: string;
    status: string | null;
    paymentReference: string;
    invalidationNote: string | null;
  }>;
};

type Seeded = {
  invoiceId: string;
  eventId: string;
  submissionId: string;
  invoiceNumber: string;
  paymentReference: string;
};

const PAYMENTS = "/dashboard/financial-hub/invoices/payments";

/**
 * Open the Payments tab on the seeded invoice's side panel (the `?invoice=`
 * deep link), after checking the row sits in "Proof to verify".
 */
async function openProofSheet(page: Page, seeded: Seeded) {
  await page.goto(`${PAYMENTS}?invoice=${seeded.invoiceId}`);
  // Scope to the seeded invoice: the deployment accumulates rows from other runs.
  await expect(
    page.getByTestId("payment-group-proof").getByTestId(`payment-row-${seeded.invoiceId}`),
  ).toBeVisible({ timeout: 30_000 });
  const sheet = page.getByTestId("invoice-sheet");
  await expect(sheet.getByText(seeded.invoiceNumber).first()).toBeVisible({ timeout: 30_000 });
  return sheet;
}

/**
 * The two payment-proof actions beyond "mark received", from the invoice side
 * panel on the Payments tab. Both only render when the invoice is approved,
 * linked inside the 90-day lookback, and carries an active submission.
 */
test.describe("staff payment proof management", () => {
  test("admin invalidates a payment proof submission with a note", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedInvoiceWithProofSubmission", {
      clientGroupName: `E2E Invalidate ${Date.now()}`,
    }) as Seeded;

    const sheet = await openProofSheet(page, seeded);
    await expect(sheet.getByText(seeded.paymentReference)).toBeVisible({ timeout: 25_000 });

    await sheet.getByRole("button", { name: "Invalidate proof", exact: true }).click();
    const dialog = page.getByTestId("invalidate-proof-dialog");
    await expect(dialog.getByText("Invalidate payment proof")).toBeVisible({ timeout: 25_000 });

    // The reason is required server-side; a rejected invalidate keeps the dialog open.
    await dialog.getByRole("button", { name: "Invalidate proof", exact: true }).click();
    await expect(dialog.getByText("Invalidate payment proof")).toBeVisible({ timeout: 25_000 });
    const stillActive = runConvex("e2eHelpers:getPaymentProofState", {
      invoiceId: seeded.invoiceId,
    }) as ProofState;
    expect(
      stillActive.submissions.find((row) => row.submissionId === seeded.submissionId)?.status,
    ).toBe("active");

    const note = "E2E: reference did not match the bank record.";
    await dialog.getByPlaceholder("Reason for invalidation (required)").fill(note);
    await dialog.getByRole("button", { name: "Invalidate proof", exact: true }).click();

    const state = await pollConvex<ProofState>(
      "e2eHelpers:getPaymentProofState",
      { invoiceId: seeded.invoiceId },
      (row) =>
        row?.submissions.some(
          (submission) =>
            submission.submissionId === seeded.submissionId && submission.status === "invalidated",
        ) ?? false,
    );
    const invalidated = state.submissions.find((row) => row.submissionId === seeded.submissionId)!;
    expect(invalidated.status).toBe("invalidated");
    expect(invalidated.invalidationNote).toBe(note);
    expect(state.paymentReceivedAt).toBeNull();

    // With no active submission left, the row leaves "Proof to verify".
    await expect(
      page.getByTestId("payment-group-proof").getByTestId(`payment-row-${seeded.invoiceId}`),
    ).toHaveCount(0, { timeout: 30_000 });
  });

  test("admin attaches a receipt file to an invoice", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedInvoiceWithProofSubmission", {
      clientGroupName: `E2E Receipt ${Date.now()}`,
    }) as Seeded;

    const sheet = await openProofSheet(page, seeded);

    // The hidden file input is shared by the page; clicking "Attach receipt"
    // is what binds it to this invoice.
    const chooserPromise = page.waitForEvent("filechooser");
    await sheet.getByRole("button", { name: "Attach receipt", exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "e2e-receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nE2E receipt fixture\n%%EOF\n"),
    });

    const state = await pollConvex<ProofState>(
      "e2eHelpers:getPaymentProofState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.hasReceipt === true,
    );
    expect(state.hasReceipt).toBe(true);
    // Attaching a receipt is not the same as recording the payment.
    expect(state.paymentReceivedAt).toBeNull();

    // The button flips to Replace once a receipt exists.
    await expect(sheet.getByRole("button", { name: "Replace receipt", exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
});
