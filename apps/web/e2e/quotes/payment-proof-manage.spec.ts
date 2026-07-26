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

/** Open the "Proof attached, no receipt" queue and return the seeded row's card. */
async function openProofQueueCard(page: Page, invoiceNumber: string) {
  await page.goto("/dashboard/financial-hub/payments");
  const queueButton = page.getByRole("button", { name: "Proof attached, no receipt", exact: true });
  await expect(queueButton).toBeVisible({ timeout: 25_000 });
  await queueButton.click();

  // Scope to the seeded invoice: this deployment is shared and the queue
  // accumulates rows from every other run.
  const card = page.locator("[data-slot='card']").filter({ hasText: invoiceNumber });
  await expect(card.getByText(invoiceNumber).first()).toBeVisible({ timeout: 30_000 });
  return card;
}

/**
 * The two payment-proof actions beyond "mark received".
 *
 * `payment-proof-verify.spec.ts` covers marking a payment received. These are
 * the other two branches of the same queue, and both only render when
 * `row.submission && !row.paymentReceivedAt` — so an invoice has to be approved,
 * linked to an event inside the 90-day lookback, and carry an active submission
 * before the buttons exist at all.
 */
test.describe("staff payment proof management", () => {
  test("admin invalidates a payment proof submission with a note", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedInvoiceWithProofSubmission", {
      clientGroupName: `E2E Invalidate ${Date.now()}`,
    }) as Seeded;

    const card = await openProofQueueCard(page, seeded.invoiceNumber);
    await expect(card.getByText(seeded.paymentReference)).toBeVisible({ timeout: 25_000 });

    await card.getByRole("button", { name: "Invalidate proof", exact: true }).click();

    await expect(page.getByText("Invalidate payment proof")).toBeVisible({ timeout: 25_000 });

    // The note is required server-side, and the client swallows the rejection —
    // the observable signal is that the panel stays open, because a successful
    // invalidate is what clears `invalidateTarget`.
    await page.getByRole("button", { name: "Confirm invalidate", exact: true }).click();
    await expect(page.getByText("Invalidate payment proof")).toBeVisible({ timeout: 25_000 });
    const stillActive = runConvex("e2eHelpers:getPaymentProofState", {
      invoiceId: seeded.invoiceId,
    }) as ProofState;
    expect(
      stillActive.submissions.find((row) => row.submissionId === seeded.submissionId)?.status,
    ).toBe("active");

    const note = "E2E: reference did not match the bank record.";
    await page.getByPlaceholder("Reason for invalidation (required)").fill(note);
    await page.getByRole("button", { name: "Confirm invalidate", exact: true }).click();

    const state = await pollConvex<ProofState>(
      "e2eHelpers:getPaymentProofState",
      { invoiceId: seeded.invoiceId },
      (row) =>
        row?.submissions.some(
          (submission) =>
            submission.submissionId === seeded.submissionId && submission.status === "invalidated",
        ) ?? false,
    );
    const invalidated = state.submissions.find(
      (row) => row.submissionId === seeded.submissionId,
    )!;
    expect(invalidated.status).toBe("invalidated");
    expect(invalidated.invalidationNote).toBe(note);
    expect(state.paymentReceivedAt).toBeNull();

    // With no active submission left, the row drops out of this queue.
    await expect(
      page.locator("[data-slot='card']").filter({ hasText: seeded.invoiceNumber }),
    ).toHaveCount(0, { timeout: 30_000 });
  });

  test("admin attaches a receipt file to an invoice", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedInvoiceWithProofSubmission", {
      clientGroupName: `E2E Receipt ${Date.now()}`,
    }) as Seeded;

    const card = await openProofQueueCard(page, seeded.invoiceNumber);

    // The hidden file input is outside the card, shared by every row; clicking
    // "Attach receipt" is what binds it to this invoice.
    const chooserPromise = page.waitForEvent("filechooser");
    await card.getByRole("button", { name: "Attach receipt", exact: true }).click();
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
    await expect(
      page
        .locator("[data-slot='card']")
        .filter({ hasText: seeded.invoiceNumber })
        .getByRole("button", { name: "Replace receipt", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
