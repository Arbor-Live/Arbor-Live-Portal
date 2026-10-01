import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import {
  createDraftInvoiceWithArtistLine,
  invoiceIdFromUrl,
  openInvoiceMenuItem,
} from "../helpers/invoice";

type EditorState = {
  invoiceNumber: string;
  status: string;
  clientApprovalStatus: string | null;
  publicApprovalToken: string | null;
  publicPath: string | null;
};

type TotalsState = {
  totalUsd: number;
  lineItems: Array<{ label: string }>;
};

test.describe("invoice duplicate", () => {
  // Changing an approved quote is covered in invoice-approved-changes.spec.ts.
  /**
   * Duplicate copies the pricing and drops everything client-specific.
   *
   * `invoices.duplicate` allocates a fresh invoice number and a fresh public
   * approval token, and explicitly clears the approval, payment, and receipt
   * fields — so a copy of an approved-and-paid quote must come back as a clean
   * draft rather than inheriting someone else's signature or payment state.
   */
  test("duplicating an invoice copies lines but not approval state", async ({ page }) => {
    const stamp = Date.now();
    const artistLabel = `E2E Duplicate Artist ${stamp}`;
    const originalId = await createDraftInvoiceWithArtistLine(page, {
      label: artistLabel,
      quantity: "3",
      rate: "60",
    });

    const original = await pollConvex<EditorState>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId: originalId },
      (row) => Boolean(row?.publicApprovalToken),
    );
    const originalTotals = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId: originalId },
      (row) => row?.totalUsd === 180,
    );
    expect(originalTotals.lineItems).toHaveLength(1);

    await openInvoiceMenuItem(page, "invoice-duplicate");
    // `router.push`, so poll the URL rather than waiting on a load event.
    await expect
      .poll(() => invoiceIdFromUrl(page), { timeout: 60_000 })
      .not.toBe(originalId);
    const copyId = invoiceIdFromUrl(page);
    expect(copyId).not.toBe(originalId);

    const copy = await pollConvex<EditorState>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId: copyId },
      (row) => Boolean(row?.invoiceNumber),
    );
    expect(copy.invoiceNumber).not.toBe(original.invoiceNumber);
    expect(copy.invoiceNumber).toMatch(/^ALINV-/);
    expect(copy.status).toBe("draft");
    expect(copy.clientApprovalStatus).toBe("pending");
    // A copy must not share the original's public link.
    expect(copy.publicApprovalToken).toBeTruthy();
    expect(copy.publicApprovalToken).not.toBe(original.publicApprovalToken);

    const copyTotals = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId: copyId },
      (row) => (row?.lineItems.length ?? 0) === 1,
    );
    expect(copyTotals.totalUsd).toBe(180);
    expect(copyTotals.lineItems[0]!.label).toBe(artistLabel);
  });
});
