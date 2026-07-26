import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import {
  createDraftInvoiceWithArtistLine,
  invoiceIdFromUrl,
  saveInvoiceEditor,
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

test.describe("invoice approval reset and duplicate", () => {
  // The reset test drives a full client approval in a second context before it
  // even starts asserting, which does not fit the 90s project default.
  test.setTimeout(180_000);

  /**
   * Editing an already-approved quote must not silently keep the approval.
   *
   * `persistDraft` puts this behind a native `window.confirm` ("Require client
   * approval again?"), and accepting it calls `resetApprovalToPending`, which
   * clears the signature, the approval timestamp, the payment submitter, and the
   * accepted terms version. Without that, a quote could be re-priced after the
   * client signed while still showing as approved at the new number.
   *
   * The dialog handler is registered before the first edit on purpose: the
   * editor also autosaves on a 2.5s debounce, so the confirm can fire from a
   * save this spec never clicked.
   */
  test("editing an approved quote resets it to pending approval", async ({ page, browser }) => {
    const stamp = Date.now();
    const invoiceId = await createDraftInvoiceWithArtistLine(page, {
      label: `E2E Reset Artist ${stamp}`,
      quantity: "1",
      rate: "150",
    });

    const drafted = await pollConvex<EditorState>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId },
      (row) => Boolean(row?.publicApprovalToken),
    );

    // Client approves it for real, through the public page.
    const clientContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const clientPage = await clientContext.newPage();
      await clientPage.goto(drafted.publicPath!);
      await expect(clientPage.getByText(/Terms & Conditions/i).first()).toBeVisible({
        timeout: 25_000,
      });
      await clientPage.getByPlaceholder("Jordan Lee").fill("E2E Reset Approver");
      await clientPage.getByText("I will be submitting the payment").click();
      await clientPage.getByRole("button", { name: "Approve quote" }).click();
      await expect(clientPage.getByText(/Approved on/i).first()).toBeVisible({ timeout: 25_000 });
    } finally {
      await clientContext.close();
    }

    const approved = await pollConvex<EditorState>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId },
      (row) => row?.clientApprovalStatus === "approved",
    );
    expect(approved.clientApprovalStatus).toBe("approved");

    // Re-open the editor so it hydrates with the approved state.
    await page.goto(`/dashboard/financial-hub/invoices/${invoiceId}`);
    await expect(page.getByRole("heading", { name: "Edit Invoice" })).toBeVisible({
      timeout: 25_000,
    });

    // Accept the re-approval prompt however it is triggered — explicit save or
    // the autosave debounce.
    page.on("dialog", (dialog) => void dialog.accept());

    await page.getByTestId("invoice-row-artist-0").getByPlaceholder("Rate").fill("400");
    await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
    await saveInvoiceEditor(page);

    const reset = await pollConvex<EditorState>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId },
      (row) => row?.clientApprovalStatus === "pending",
    );
    expect(reset.clientApprovalStatus).toBe("pending");

    const repriced = await pollConvex<TotalsState>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => row?.totalUsd === 400,
    );
    expect(repriced.totalUsd).toBe(400);

    // And the client-facing page is back to asking for a signature.
    const recheckContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const recheckPage = await recheckContext.newPage();
      await recheckPage.goto(approved.publicPath!);
      await expect(recheckPage.getByRole("button", { name: "Approve quote" })).toBeVisible({
        timeout: 25_000,
      });
      await expect(recheckPage.getByText(/Approved on/i)).toHaveCount(0);
    } finally {
      await recheckContext.close();
    }
  });

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

    await page.getByTestId("invoice-duplicate").click();
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
