import { test, expect, type Browser } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
import { pollConvex, runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { clientApprovedQuote, type InvoiceRevisionsState } from "../helpers/invoice";

/** Open the client's portal on the quote tab and hand the page to `check`. */
async function asClient(browser: Browser, publicPath: string, check: (page: import("@playwright/test").Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL: e2eEnv.baseURL });
  try {
    const page = await context.newPage();
    await page.goto(`${publicPath}?tab=quote`);
    await check(page);
  } finally {
    await context.close();
  }
}

test.describe("approved estimate → final invoice", () => {
  // Each test drives a real client approval in a second context first.
  test.setTimeout(180_000);

  test("payment waits for the final invoice, then opens", async ({ page, browser }) => {
    const { invoiceId, publicPath } = await clientApprovedQuote(page, browser, `E2E Final ${Date.now()}`);

    // Approved, but still an estimate: the client is told not to pay yet.
    await asClient(browser, publicPath, async (client) => {
      await expect(client.getByTestId("public-quote-estimate-note")).toContainText("Please don't send payment", {
        timeout: 25_000,
      });
      await expect(client.getByTestId("public-payment-awaiting-final")).toBeVisible();
      await expect(client.getByText("Submit Payment Proof")).toHaveCount(0);
    });

    // The portal hides the form, and the server refuses too: a portal token
    // can't submit proof on an estimate.
    const token = (
      await pollConvex<{ publicApprovalToken: string | null }>(
        "e2eHelpers:getInvoiceEditorState",
        { invoiceId },
        (row) => Boolean(row?.publicApprovalToken),
      )
    ).publicApprovalToken!;
    expect(() =>
      runConvex("paymentProof:submitByQuoteToken", {
        token,
        paymentMethod: "assu_epay",
        paymentReference: "E2E-EARLY-1",
      }),
    ).toThrow(/Payment isn't open yet/);

    const billing = page.getByTestId("invoice-billing-state");
    await expect(billing).toContainText("Approved estimate", { timeout: 25_000 });
    await billing.getByTestId("invoice-finalize-billing").click();
    await acceptAppDialog(page, "Finalize invoice");
    await expect(page.getByText(/Finalized as version 2\. Payment is open\./)).toBeVisible({ timeout: 25_000 });
    await expect(billing).toContainText("Final invoice since");
    await expect(page.getByTestId("quote-version-2")).toContainText("Final invoice");

    const state = await pollConvex<InvoiceRevisionsState>(
      "e2eHelpers:getInvoiceRevisionsState",
      { invoiceId },
      (row) => row?.revisions.length === 2,
    );
    expect(state.revisions[1]).toMatchObject({ kind: "final", totalUsd: 150 });

    await asClient(browser, publicPath, async (client) => {
      await expect(client.getByText("Submit Payment Proof").first()).toBeVisible({ timeout: 25_000 });
      await expect(client.getByTestId("public-quote-estimate-note")).toHaveCount(0);
      await expect(client.getByText("Final invoice").first()).toBeVisible();
    });

    // A final invoice can't be edited in place: reopen it first.
    await page.getByTestId("invoice-row-artist-0").getByPlaceholder("Rate").fill("175");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("This is the final invoice. Reopen it to make changes.")).toBeVisible({
      timeout: 25_000,
    });
  });

  test("staff can open payment early with a reason", async ({ page, browser }) => {
    const { publicPath } = await clientApprovedQuote(page, browser, `E2E Early ${Date.now()}`);

    const billing = page.getByTestId("invoice-billing-state");
    await billing.getByRole("button", { name: "Open payment early" }).click();
    const dialog = page.getByTestId("open-payment-early-dialog");
    const open = dialog.getByRole("button", { name: "Open payment" });
    await expect(open).toBeDisabled();
    await dialog.getByLabel("Why").fill("Grant funds expire this quarter.");
    await open.click();
    await expect(billing).toContainText("Payment opened early", { timeout: 25_000 });
    await expect(billing).toContainText("Grant funds expire this quarter.");

    await asClient(browser, publicPath, async (client) => {
      await expect(client.getByText("Submit Payment Proof").first()).toBeVisible({ timeout: 25_000 });
      // Still an estimate, but no "don't pay" once payment is open.
      await expect(client.getByTestId("public-quote-estimate-note")).not.toContainText("Please don't send payment");
    });
  });

  test("a final invoice with pending payment proof can't be reopened", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedInvoiceWithProofSubmission", {
      clientGroupName: `E2E Final Proof ${Date.now()}`,
    }) as { invoiceId: string };

    await page.goto(`/dashboard/ops-center/invoices/${seeded.invoiceId}`);
    const billing = page.getByTestId("invoice-billing-state");
    await expect(billing).toContainText("Final invoice since", { timeout: 25_000 });
    await expect(billing.getByTestId("invoice-billing-proof-pending")).toContainText(
      "Payment proof is pending. Verify or invalidate it first.",
      { timeout: 25_000 },
    );
    await expect(billing.getByRole("button", { name: "Reopen" })).toHaveCount(0);
  });
});
