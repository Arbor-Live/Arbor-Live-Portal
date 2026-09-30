import { test, expect, type Page } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

type BandPayee = { userId: string; organizationId: string };

type SeededPayment = {
  paymentId: string;
  eventId: string;
  eventTitle: string;
  confirmationToken: string;
  adminPath: string;
};

type PaymentState = {
  status: string;
  servicePaymentNumber: string | null;
  signatureTypedName: string | null;
  totalUsd: number;
};

function ensurePayee(): BandPayee {
  return runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: e2eEnv.bandEmail,
    password: e2eEnv.bandPassword,
    name: e2eEnv.bandName,
    bandName: e2eEnv.bandOrgName,
  }) as BandPayee;
}

function seedPayment(status: "pending_email" | "confirmed", label: string): SeededPayment {
  const payee = ensurePayee();
  return runConvex("e2eHelpers:seedBandPaymentForEsign", {
    organizationId: payee.organizationId,
    payeeUserId: payee.userId,
    payeeName: e2eEnv.bandName,
    payeeEmail: e2eEnv.bandEmail,
    status,
    eventTitle: `E2E Payout ${label} ${Date.now()}`,
  }) as SeededPayment;
}

/** Open the payouts pipeline and return the row for one seeded payment. */
async function openPayoutRow(page: Page, eventTitle: string) {
  await page.goto("/dashboard/financial-hub/artist-payouts");
  await expect(page.getByTestId("payout-pipeline")).toBeVisible({ timeout: 30_000 });

  // Search narrows the pipeline to the seeded payout(s).
  await page.getByRole("textbox", { name: "Search payouts" }).fill(eventTitle);
  const row = page.getByTestId("payout-row").filter({ hasText: eventTitle }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

test.describe("band payouts queue", () => {
  test("admin can send a signature request from the pipeline", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = seedPayment("pending_email", "Sig");

    const row = await openPayoutRow(page, seeded.eventTitle);
    await expect(row).toHaveAttribute("data-status", "pending_email");
    await row.getByRole("button", { name: "Send signature request" }).click();

    // The primary action opens a preview dialog; sending happens from there.
    const dialog = page.getByTestId("payout-send-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Send signature request" }).click();

    const state = await pollConvex<PaymentState>(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row) => row?.status === "awaiting_confirmation",
    );
    expect(state.status).toBe("awaiting_confirmation");

    // The signature request goes out through the mocked email queue.
    const email = await pollConvex<{ template: string; to: string }>(
      "e2eHelpers:getLatestEmailNotification",
      { to: e2eEnv.bandEmail, template: "band_payment_confirmation" },
      (row) => row?.template === "band_payment_confirmation",
    );
    expect(email.to.toLowerCase()).toBe(e2eEnv.bandEmail.toLowerCase());
    expect(email.template).toBe("band_payment_confirmation");
  });

  test("admin can preview the signature request email", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = seedPayment("pending_email", "Preview");
    for (let i = 0; i < 12; i += 1) {
      seedPayment("pending_email", `Filler${i}`);
    }

    const row = await openPayoutRow(page, seeded.eventTitle);
    await row.getByRole("button", { name: "Send signature request" }).click();

    // The preview is a centered dialog, so it's visible even when the payout
    // sits far down a long pipeline.
    const dialog = page.getByTestId("payout-send-dialog");
    await expect(
      dialog.getByText(`Payment ready for your signature: ${seeded.eventTitle}`),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.getByText(new RegExp(`\\[${seeded.confirmationToken}\\]`)),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const state = await runConvex("e2eHelpers:getBandPaymentState", {
      paymentId: seeded.paymentId,
    }) as PaymentState;
    expect(state.status).toBe("pending_email");
  });

  test("admin can edit a payout's amount from the queue side panel", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = seedPayment("pending_email", "Edit");

    const row = await openPayoutRow(page, seeded.eventTitle);
    await row.click();

    const sheet = page.getByTestId("payout-sheet");
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole("button", { name: "Edit payout" }).click();

    const dialog = page.getByTestId("payout-edit-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel("Total payout (USD)").fill("425");
    await dialog.getByRole("button", { name: "Save payout" }).click();

    // The dialog closes once the save resolves and the panel shows the new amount.
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(sheet.getByText("$425.00")).toBeVisible({ timeout: 15_000 });
    const state = await pollConvex<PaymentState>(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row) => row?.totalUsd === 425,
    );
    expect(state.totalUsd).toBe(425);
  });

  test("admin can mark a signed payment paid from the pipeline", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = seedPayment("confirmed", "Paid");
    const servicePaymentNumber = `SP-E2E-${String(Date.now()).slice(-6)}`;

    const row = await openPayoutRow(page, seeded.eventTitle);
    await row.getByRole("button", { name: "Mark paid" }).click();

    const dialog = page.getByTestId("payout-mark-paid-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel("Transfer / Service Payment number").fill(servicePaymentNumber);
    await dialog.getByRole("button", { name: "Mark paid" }).click();

    const state = await pollConvex<PaymentState>(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row) => row?.status === "paid",
    );
    expect(state.status).toBe("paid");
    expect(state.servicePaymentNumber).toBe(servicePaymentNumber);
  });

  test("admin can batch mark payouts paid with one transfer number", async ({ page }) => {
    test.setTimeout(120_000);

    const batchLabel = `Batch${Date.now()}`;
    const first = seedPayment("confirmed", `${batchLabel} A`);
    const second = seedPayment("confirmed", `${batchLabel} B`);
    const servicePaymentNumber = `SP-E2E-B${String(Date.now()).slice(-6)}`;

    // Both seeded titles contain the batch label, so one search finds both.
    await openPayoutRow(page, first.eventTitle);
    await page.getByRole("textbox", { name: "Search payouts" }).fill(batchLabel);
    const stage = page.getByTestId("payout-stage-ready_to_pay");
    await expect(stage.getByTestId("payout-row")).toHaveCount(2, { timeout: 30_000 });

    await stage.getByRole("checkbox", { name: "Select all in Ready to pay" }).click();
    await stage.getByRole("button", { name: "Mark 2 paid" }).click();

    const dialog = page.getByTestId("payout-mark-paid-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel("Transfer / Service Payment number").fill(servicePaymentNumber);
    await dialog.getByRole("button", { name: "Mark 2 paid" }).click();

    for (const seeded of [first, second]) {
      const state = await pollConvex<PaymentState>(
        "e2eHelpers:getBandPaymentState",
        { paymentId: seeded.paymentId },
        (row) => row?.status === "paid",
      );
      expect(state.servicePaymentNumber).toBe(servicePaymentNumber);
    }
  });
});
