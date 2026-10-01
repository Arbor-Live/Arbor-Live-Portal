import { test, expect, type Page } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { clientApprovedQuote as approvedQuote, saveInvoiceEditor, type InvoiceRevisionsState as RevisionsState } from "../helpers/invoice";

/** Reprice the artist line to $400 and click Save, which opens the decision dialog. */
async function repriceAndSave(page: Page) {
  await page.getByTestId("invoice-row-artist-0").getByPlaceholder("Rate").fill("400");
  await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
  await saveInvoiceEditor(page);
  const dialog = page.getByTestId("approved-change-dialog");
  await expect(dialog).toBeVisible({ timeout: 25_000 });
  const totals = dialog.getByTestId("approved-change-totals");
  await expect(totals).toContainText("$150.00", { timeout: 25_000 });
  await expect(totals).toContainText("$400.00");
  await expect(totals).toContainText("+$250.00");
  await expect(dialog.getByTestId("quote-change-list")).toContainText("Changed");
  return dialog;
}

test.describe("changing an approved quote", () => {
  // Each test drives a real client approval in a second context first.
  test.setTimeout(180_000);

  test("doesn't autosave, and cancelling the decision saves nothing", async ({ page, browser }) => {
    const { invoiceId } = await approvedQuote(page, browser, `E2E Approved Cancel ${Date.now()}`);

    await page.getByTestId("invoice-row-artist-0").getByPlaceholder("Rate").fill("400");
    await expect(page.getByText(/This quote is approved, and these changes aren.t saved/)).toBeVisible({
      timeout: 30_000,
    });
    // Longer than the old 2.5s autosave: nothing may reach the server on its own.
    await page.waitForTimeout(4_000);
    await expect(page.getByTestId("approved-change-dialog")).toHaveCount(0);

    await saveInvoiceEditor(page);
    const dialog = page.getByTestId("approved-change-dialog");
    await expect(dialog).toBeVisible({ timeout: 25_000 });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    const state = await pollConvex<RevisionsState>("e2eHelpers:getInvoiceRevisionsState", { invoiceId }, (row) =>
      Boolean(row),
    );
    expect(state.clientApprovalStatus).toBe("approved");
    expect(state.totalUsd).toBe(150);
    expect(state.revisions).toHaveLength(1);
    // Still dirty: the edit is kept locally, just not saved.
    await expect(page.getByText("Unsaved changes")).toBeVisible();
  });

  test("sending for re-approval saves a version and shows the client what changed", async ({ page, browser }) => {
    const { invoiceId, publicPath } = await approvedQuote(page, browser, `E2E Approved Resend ${Date.now()}`);

    const dialog = await repriceAndSave(page);
    await dialog.getByLabel("Note to the client (optional)").fill("Added a second set.");
    await dialog.getByRole("button", { name: "Save and send for re-approval" }).click();
    await expect(page.getByText(/Saved as version 2 and sent to the client for re-approval/)).toBeVisible({
      timeout: 25_000,
    });

    const state = await pollConvex<RevisionsState>(
      "e2eHelpers:getInvoiceRevisionsState",
      { invoiceId },
      (row) => row?.clientApprovalStatus === "pending" && row.revisions.length === 2,
    );
    expect(state.totalUsd).toBe(400);
    expect(state.approvedTotalUsd).toBe(150);
    expect(state.revisions[1]).toMatchObject({
      number: 2,
      kind: "reapproval_requested",
      totalUsd: 400,
      note: "Added a second set.",
    });
    await expect(page.getByTestId("quote-version-2")).toContainText("Sent for re-approval");

    const clientContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const clientPage = await clientContext.newPage();
      await clientPage.goto(`${publicPath}?tab=quote`);
      const banner = clientPage.getByTestId("public-quote-updated");
      await expect(banner).toBeVisible({ timeout: 25_000 });
      await expect(banner).toContainText("You approved $150.00. It's now $400.00 (+$250.00)");
      await expect(banner).toContainText("Added a second set.");
      await expect(clientPage.getByTestId("public-quote-history")).toContainText("v1");
      await expect(clientPage.getByRole("button", { name: "Approve quote" })).toBeVisible();
    } finally {
      await clientContext.close();
    }
  });

  test("keeping the approval needs a reason and keeps the client's approval", async ({ page, browser }) => {
    const { invoiceId } = await approvedQuote(page, browser, `E2E Approved Keep ${Date.now()}`);

    const dialog = await repriceAndSave(page);
    await dialog.getByRole("radio", { name: "Keep the approval" }).click();
    const save = dialog.getByRole("button", { name: "Save and keep approval" });
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Why the approval still stands").fill("Client agreed by email.");
    await save.click();
    await expect(page.getByText(/Saved as version 2\. The client.s approval stands/)).toBeVisible({
      timeout: 25_000,
    });

    const state = await pollConvex<RevisionsState>(
      "e2eHelpers:getInvoiceRevisionsState",
      { invoiceId },
      (row) => row?.revisions.length === 2,
    );
    expect(state.clientApprovalStatus).toBe("approved");
    expect(state.totalUsd).toBe(400);
    expect(state.approvedTotalUsd).toBe(150);
    expect(state.revisions[1]).toMatchObject({ kind: "change_kept_approval", note: "Client agreed by email." });
  });

  test("discounting to match keeps the approved total and the approval", async ({ page, browser }) => {
    const { invoiceId } = await approvedQuote(page, browser, `E2E Approved Match ${Date.now()}`);

    const dialog = await repriceAndSave(page);
    await dialog.getByRole("radio", { name: /discount to match the approval/ }).click();
    await expect(dialog.getByTestId("approved-change-help")).toContainText(
      "The discount becomes $250.00, so the total stays $150.00",
    );
    await dialog.getByRole("button", { name: "Save with discount" }).click();
    await expect(page.getByText(/Saved as version 2 with a \$250\.00 discount/)).toBeVisible({ timeout: 25_000 });

    const state = await pollConvex<RevisionsState>(
      "e2eHelpers:getInvoiceRevisionsState",
      { invoiceId },
      (row) => row?.revisions.length === 2,
    );
    expect(state.clientApprovalStatus).toBe("approved");
    expect(state.totalUsd).toBe(150);
    expect(state.revisions[1]).toMatchObject({ kind: "matched_approval", totalUsd: 150 });
    const totals = await pollConvex<{ discountType: string; discountValue: number; subtotalUsd: number }>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => Boolean(row),
    );
    expect(totals).toMatchObject({ discountType: "amount", discountValue: 250, subtotalUsd: 400 });

    // The editor adopted the server's discount, so nothing reads as unsaved.
    await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 10_000 });
  });
});
