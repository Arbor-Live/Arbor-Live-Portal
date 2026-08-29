import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { waitForSentEmail } from "../helpers/email";
import { e2eEnv } from "../helpers/env";

type ReviewState = {
  status: string;
  isRequestLinked: boolean;
  clientReviewReadyAt: number | null;
  clientReadyMessage: string | null;
  clientApprovalStatus: string | null;
  requestTrackPath: string | null;
};

/**
 * Sending a booking-request quote to the client, withdrawing it, and re-sending.
 *
 * The editor renders one of two mutually exclusive cards: "Request portal" when
 * the invoice has a `sourceEventRequestId`, "Quote approval" otherwise. The
 * backend enforces the same split — `markReadyForClientReview` rejects a
 * standalone quote and `regeneratePublicApprovalToken` rejects a request-linked
 * one — so this spec asserts the card split as well as the round trip, and
 * `invoice-token-regeneration.spec.ts` covers the other half.
 *
 * Two things here are new as of #68 and had no coverage: the personal message is
 * required (the mutation rejects an empty one, and the sheet disables Send), and
 * it is persisted to `clientReadyMessage` so the email body can include it.
 * Sending also requires at least one terms template on the quote (seeded by
 * `seedRequestLinkedDraftQuote`, enforced by `markReadyForClientReview`).
 *
 * The re-send assertion matters because `scheduleBookingQuoteReadyEmail` keys
 * idempotency on `booking_quote_ready:{invoiceId}:{clientReviewReadyAt}`: a
 * withdraw/re-send has to move `clientReviewReadyAt` for the client to be
 * emailed a second time.
 */
test.describe("invoice send for client review", () => {
  // Send, withdraw, re-send, two email round trips, plus a public page load in a
  // second context — well past the 90s project default.
  test.setTimeout(180_000);

  test("admin sends with a message, withdraws, and re-sends a request-linked quote", async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    const seeded = runConvex("e2eHelpers:seedRequestLinkedDraftQuote", {
      eventName: `E2E Send Review ${stamp}`,
    }) as {
      invoiceId: string;
      invoiceNumber: string;
      editorPath: string;
      trackPath: string;
    };
    const clientEmail = "e2e.requester@stanford.edu";
    const firstMessage = `E2E first send ${stamp}`;
    const secondMessage = `E2E second send ${stamp}`;

    await page.goto(seeded.editorPath);
    await expect(page.getByRole("heading", { name: "Edit Invoice" })).toBeVisible({
      timeout: 25_000,
    });

    // Request-linked quotes get the portal card and never the standalone link.
    await expect(page.getByTestId("invoice-request-portal")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("invoice-quote-approval")).toHaveCount(0);
    await expect(page.getByTestId("invoice-request-portal-link")).toHaveValue(
      new RegExp(seeded.trackPath.replace(/\//g, "\\/")),
    );

    // Open the send sheet.
    const beforeFirstSend = Date.now() - 5_000;
    await page.getByTestId("invoice-send-quote-to-client").click();
    await expect(page.getByRole("heading", { name: "Send quote to client" })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.locator("#quote-ready-to")).toHaveValue(clientEmail);

    // The message is required: blanking it disables Send.
    const messageField = page.locator("#quote-ready-message");
    await messageField.fill("   ");
    await expect(page.getByRole("button", { name: "Send email" })).toBeDisabled();

    await messageField.fill(firstMessage);
    await page.getByRole("button", { name: "Send email" }).click();

    const sent = await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientReviewReadyAt != null,
    );
    expect(sent.isRequestLinked).toBe(true);
    expect(sent.status).toBe("finalized");
    expect(sent.clientReadyMessage).toBe(firstMessage);

    const firstEmail = await waitForSentEmail({
      to: clientEmail,
      template: "booking_quote_ready",
      afterCreatedAt: beforeFirstSend,
    });
    expect(firstEmail.subject).toContain("E2E Send Review");

    // The card flips to Withdraw once the quote is out for review.
    await expect(page.getByTestId("invoice-withdraw-review")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("invoice-send-quote-to-client")).toHaveCount(0);

    // Withdraw puts it back to a draft the client cannot act on.
    await page.getByTestId("invoice-withdraw-review").click();

    const withdrawn = await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientReviewReadyAt === null,
    );
    expect(withdrawn.status).toBe("draft");
    await expect(page.getByTestId("invoice-send-quote-to-client")).toBeVisible({ timeout: 25_000 });

    // Re-send with a different message: a new readyAt means a new idempotency
    // key, so the client is emailed again rather than the send being swallowed.
    await page.getByTestId("invoice-send-quote-to-client").click();
    await expect(page.getByRole("heading", { name: "Send quote to client" })).toBeVisible({
      timeout: 25_000,
    });
    await page.locator("#quote-ready-message").fill(secondMessage);
    await page.getByRole("button", { name: "Send email" }).click();

    const resent = await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientReadyMessage === secondMessage,
    );
    expect(resent.clientReviewReadyAt).not.toBe(sent.clientReviewReadyAt);

    const secondEmail = await waitForSentEmail({
      to: clientEmail,
      template: "booking_quote_ready",
      afterCreatedAt: firstEmail.createdAt + 1,
    });
    expect(secondEmail.id).not.toBe(firstEmail.id);

    // Finally, confirm the client actually sees a reviewable quote on the
    // portal link — in a clean context, without the admin session. `baseURL` is
    // passed explicitly because a hand-rolled context does not inherit the
    // project's `use` options.
    const clientContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const clientPage = await clientContext.newPage();
      await clientPage.goto(seeded.trackPath);
      await expect(
        clientPage.getByText(/Terms & Conditions|Approve quote/i).first(),
      ).toBeVisible({ timeout: 25_000 });
    } finally {
      await clientContext.close();
    }
  });

  test("re-sending after client requested changes resets approval to pending", async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    const seeded = runConvex("e2eHelpers:seedRequestLinkedDraftQuote", {
      eventName: `E2E Resend After Changes ${stamp}`,
    }) as {
      invoiceId: string;
      trackPath: string;
      editorPath: string;
    };
    const resendMessage = `E2E resend after changes ${stamp}`;

    await page.goto(seeded.editorPath);
    await expect(page.getByRole("heading", { name: "Edit Invoice" })).toBeVisible({
      timeout: 25_000,
    });

    await page.getByTestId("invoice-send-quote-to-client").click();
    await page.locator("#quote-ready-message").fill(`E2E first send ${stamp}`);
    await page.getByRole("button", { name: "Send email" }).click();

    await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientReviewReadyAt != null,
    );

    const clientContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const clientPage = await clientContext.newPage();
      await clientPage.goto(seeded.trackPath);
      await expect(clientPage.getByText(/Terms & Conditions/i).first()).toBeVisible({
        timeout: 25_000,
      });
      await clientPage.getByPlaceholder("Tell us what changes are needed").fill("Please adjust crew hours.");
      await clientPage.getByRole("button", { name: "Request changes" }).click();
      await expect(clientPage.getByText(/Changes requested on/i).first()).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await clientContext.close();
    }

    const changesRequested = await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientApprovalStatus === "changes_requested",
    );
    expect(changesRequested.clientApprovalStatus).toBe("changes_requested");

    await page.getByTestId("invoice-withdraw-review").click();
    await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientReviewReadyAt === null,
    );

    await page.getByTestId("invoice-send-quote-to-client").click();
    await page.locator("#quote-ready-message").fill(resendMessage);
    await page.getByRole("button", { name: "Send email" }).click();

    const resent = await pollConvex<ReviewState>(
      "e2eHelpers:getInvoiceReviewState",
      { invoiceId: seeded.invoiceId },
      (row) => row?.clientReadyMessage === resendMessage,
    );
    expect(resent.clientApprovalStatus).toBe("pending");

    const recheckContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const recheckPage = await recheckContext.newPage();
      await recheckPage.goto(seeded.trackPath);
      await expect(recheckPage.getByRole("button", { name: "Approve quote" })).toBeVisible({
        timeout: 25_000,
      });
      await expect(recheckPage.getByText(/Awaiting your approval/i)).toBeVisible({
        timeout: 25_000,
      });
    } finally {
      await recheckContext.close();
    }
  });
});
