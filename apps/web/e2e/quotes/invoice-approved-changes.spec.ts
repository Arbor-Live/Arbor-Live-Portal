import { test, expect, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import {
  clientApprovedQuote as approvedQuote,
  invoiceEditorHeading,
  saveInvoiceEditor,
  type InvoiceRevisionsState as RevisionsState,
} from "../helpers/invoice";

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
  // The total went up: lowering a discount is never suggested.
  await expect(dialog.getByTestId("approved-discount-suggestion")).toHaveCount(0);
  return dialog;
}

const LONG_CREW_NAME = "Maximiliana Alexandria Bartholomew-Featherstonehaugh-Wolfeschlegelsteinhausenberger";

/**
 * An approved $960 quote ($1,000 less a $40 discount) whose final crew came
 * in $20 cheaper: load-in drops from 5h to 4.75h for two people at $40/h.
 * Saves and returns the open decision dialog.
 */
async function crewCheaperAndSave(page: Page) {
  const { invoiceId } = runConvex("e2eHelpers:seedApprovedQuoteWithDiscountAndCrew", {
    clientGroupName: `E2E Discount Lower ${Date.now()}`,
    crewName: LONG_CREW_NAME,
  }) as { invoiceId: string };
  await page.goto(`/dashboard/financial-hub/invoices/${invoiceId}`);
  await expect(invoiceEditorHeading(page)).toBeVisible({ timeout: 60_000 });
  const hours = page.getByTestId("invoice-row-crew-0").getByLabel("Hours");
  await expect(hours).toHaveValue("5", { timeout: 30_000 });
  await hours.fill("4.75");
  await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
  await saveInvoiceEditor(page);
  const dialog = page.getByTestId("approved-change-dialog");
  await expect(dialog).toBeVisible({ timeout: 25_000 });
  await expect(dialog.getByTestId("approved-change-totals")).toContainText("−$20.00", { timeout: 25_000 });
  await expect(dialog.getByTestId("quote-change-list")).toContainText(LONG_CREW_NAME);
  return { invoiceId, dialog };
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

  test("a long line name wraps inside the decision dialog on desktop and phone", async ({ page, browser }) => {
    // One unbreakable run, like a long crew name in a crew line's label.
    const label = `E2E Maximiliana-Bartholomew-Featherstonehaugh-Wolfeschlegelsteinhausenberger ${Date.now()}`;
    await approvedQuote(page, browser, label);

    const dialog = await repriceAndSave(page);
    await expect(dialog.getByTestId("quote-change-list")).toContainText(label);
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    // The dialog scrolls rather than running off a short screen.
    await dialog.getByRole("button", { name: "Cancel" }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
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

  test("cheaper crew suggests lowering the existing discount to keep the approved total", async ({ page }) => {
    const { invoiceId, dialog } = await crewCheaperAndSave(page);

    const suggestion = dialog.getByTestId("approved-discount-suggestion");
    await expect(suggestion).toContainText("Discount $40.00 → $20.00 keeps the total at the approved $960.00");
    await suggestion.getByRole("button", { name: "Lower to $20.00" }).click();
    await expect(dialog.getByRole("radio", { name: "Lower the discount to match the approval" })).toHaveAttribute(
      "data-state",
      "on",
    );
    await expect(dialog.getByTestId("approved-change-help")).toContainText(
      "The discount goes from $40.00 to $20.00, so the total stays $960.00",
    );
    await dialog.getByRole("button", { name: "Save with lower discount" }).click();
    await expect(page.getByText(/Saved as version 2 with a \$20\.00 discount\. The approved total stands/)).toBeVisible({
      timeout: 25_000,
    });

    const state = await pollConvex<RevisionsState>(
      "e2eHelpers:getInvoiceRevisionsState",
      { invoiceId },
      (row) => row?.revisions.length === 2,
    );
    expect(state.clientApprovalStatus).toBe("approved");
    expect(state.totalUsd).toBe(960);
    expect(state.revisions[1]).toMatchObject({ kind: "matched_approval", totalUsd: 960 });
    expect(state.revisions[1]!.note).toContain("Lowered the discount from $40.00 to $20.00");
    const totals = await pollConvex<{ discountType: string; discountValue: number; subtotalUsd: number }>(
      "e2eHelpers:getInvoiceTotalsState",
      { invoiceId },
      (row) => Boolean(row),
    );
    expect(totals).toMatchObject({ discountType: "amount", discountValue: 20, subtotalUsd: 980 });
    await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 10_000 });
  });

  test("keeping the discount as is leaves the decision to the other choices", async ({ page }) => {
    const { dialog } = await crewCheaperAndSave(page);

    const suggestion = dialog.getByTestId("approved-discount-suggestion");
    await suggestion.getByRole("button", { name: "Keep $40.00" }).click();
    await expect(suggestion).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Save and send for re-approval" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
