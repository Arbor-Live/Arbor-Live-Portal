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

/** Open a queue tab and return the card for one seeded payment. */
async function openQueueCard(page: Page, queueLabel: RegExp, eventTitle: string) {
  await page.goto("/dashboard/financial-hub/band-payouts");
  await expect(page.getByText("Band payment defaults")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: queueLabel }).click();
  const card = page.locator('[data-slot="card"]').filter({ hasText: eventTitle }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

test.describe("band payouts queue", () => {
  test("admin can send a signature request from the queue", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = seedPayment("pending_email", "Sig");

    const card = await openQueueCard(page, /Needs signature request/, seeded.eventTitle);
    await card.getByRole("button", { name: "Send signature request" }).click();

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

  test("admin can mark a signed payment paid from the queue", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = seedPayment("confirmed", "Paid");
    const servicePaymentNumber = `SP-E2E-${String(Date.now()).slice(-6)}`;

    const card = await openQueueCard(page, /Ready to pay/, seeded.eventTitle);
    await card.getByRole("button", { name: "Mark paid" }).click();

    // Mark paid opens a centered dialog (not an inline card under the queue).
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Mark band payment paid")).toBeVisible({ timeout: 15_000 });
    await dialog.getByPlaceholder("SP-2026-0042").fill(servicePaymentNumber);
    await dialog.getByRole("button", { name: "Confirm paid" }).click();

    const state = await pollConvex<PaymentState>(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row) => row?.status === "paid",
    );
    expect(state.status).toBe("paid");
    expect(state.servicePaymentNumber).toBe(servicePaymentNumber);
  });
});
