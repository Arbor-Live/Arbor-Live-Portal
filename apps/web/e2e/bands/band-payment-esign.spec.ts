import { test, expect } from "@playwright/test";
import { bandAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

/**
 * UI-tests band e-sign; seeds past the heavy admin payouts queue (listByQueue /
 * sidebar badge storms timeout under anonymous CI Convex). Admin mark-paid is
 * asserted via e2eHelpers after the payee confirms.
 */
test.describe("band payment e-sign loop", () => {
  test("payee can e-sign an awaiting payment; admin mark-paid via helper", async ({ browser }) => {
    const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: e2eEnv.bandEmail,
      password: e2eEnv.bandPassword,
      name: e2eEnv.bandName,
      bandName: e2eEnv.bandOrgName,
    }) as {
      userId: string;
      organizationId: string;
      email: string;
    };

    const seeded = runConvex("e2eHelpers:seedBandPaymentForEsign", {
      organizationId: band.organizationId,
      payeeUserId: band.userId,
      payeeName: e2eEnv.bandName,
      payeeEmail: band.email,
      status: "awaiting_confirmation",
      eventTitle: `E2E Payout ${Date.now()}`,
    }) as {
      paymentId: string;
      eventTitle: string;
      bandPath: string;
      confirmationToken: string;
    };

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto(seeded.bandPath);
    await expect(bandPage.getByText("Payment history").first()).toBeVisible({ timeout: 25_000 });
    await expect(bandPage.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(bandPage.getByText(seeded.confirmationToken).first()).toBeVisible();
    await bandPage.getByRole("button", { name: "E-sign" }).first().click();
    await expect(bandPage.getByText("E-sign payment").first()).toBeVisible();
    await bandPage.locator('input[type="checkbox"]').check();
    await bandPage.locator("#band-payment-sign-name").fill(e2eEnv.bandName);
    await bandPage.getByRole("button", { name: "Submit signature" }).click();
    await expect(bandPage.getByText(/Payment signed/i).first()).toBeVisible({ timeout: 20_000 });
    await bandContext.close();

    await pollConvex(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row: { status: string } | null) => row?.status === "confirmed",
    );

    runConvex("e2eHelpers:markBandPaymentPaid", {
      paymentId: seeded.paymentId,
      servicePaymentNumber: "SP-E2E-0042",
    });

    const paid = await pollConvex<{
      status: string;
      servicePaymentNumber: string | null;
      signatureTypedName: string | null;
    }>(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row) => row?.status === "paid",
    );
    expect(paid.status).toBe("paid");
    expect(paid.servicePaymentNumber).toBe("SP-E2E-0042");
    expect(paid.signatureTypedName).toBe(e2eEnv.bandName);
  });
});
