import { test, expect } from "@playwright/test";
import { adminAuthFile, bandAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("band payment e-sign loop", () => {
  test("admin sends signature request, payee signs, admin marks paid", async ({ browser }) => {
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
      status: "pending_email",
      eventTitle: `E2E Payout ${Date.now()}`,
    }) as {
      paymentId: string;
      eventTitle: string;
      adminPath: string;
      bandPath: string;
    };

    const adminContext = await browser.newContext({ storageState: adminAuthFile });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(seeded.adminPath);
    await expect(adminPage.getByText("Band Payouts").first()).toBeVisible({ timeout: 25_000 });
    await adminPage.getByRole("button", { name: "Needs signature request" }).click();
    await expect(adminPage.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 20_000 });

    const adminCard = adminPage
      .locator("div")
      .filter({ hasText: seeded.eventTitle })
      .filter({ has: adminPage.getByRole("button", { name: "Send signature request" }) })
      .first();
    await adminCard.getByRole("button", { name: "Send signature request" }).click();

    await pollConvex(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row: { status: string } | null) => row?.status === "awaiting_confirmation",
    );
    await adminContext.close();

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto(seeded.bandPath);
    await expect(bandPage.getByText("Payment history").first()).toBeVisible({ timeout: 25_000 });
    await expect(bandPage.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 20_000 });
    await bandPage.getByRole("button", { name: "E-sign" }).first().click();
    await expect(bandPage.getByText("E-sign payment").first()).toBeVisible();
    await bandPage.locator('input[type="checkbox"]').check();
    await bandPage.locator("#band-payment-sign-name").fill(e2eEnv.bandName);
    await bandPage.getByRole("button", { name: "Submit signature" }).click();
    await expect(bandPage.getByText(/Payment signed/i).first()).toBeVisible({ timeout: 20_000 });

    await pollConvex(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row: { status: string } | null) => row?.status === "confirmed",
    );
    await bandContext.close();

    const adminContext2 = await browser.newContext({ storageState: adminAuthFile });
    const adminPage2 = await adminContext2.newPage();
    await adminPage2.goto(seeded.adminPath);
    await adminPage2.getByRole("button", { name: "Ready to pay" }).click();
    await expect(adminPage2.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 20_000 });
    const readyCard = adminPage2
      .locator("div")
      .filter({ hasText: seeded.eventTitle })
      .filter({ has: adminPage2.getByRole("button", { name: "Mark paid" }) })
      .first();
    await readyCard.getByRole("button", { name: "Mark paid" }).click();
    await expect(adminPage2.getByText("Mark band payment paid").first()).toBeVisible();
    await adminPage2.getByPlaceholder("SP-2026-0042").fill("SP-E2E-0042");
    await adminPage2.getByRole("button", { name: "Confirm paid" }).click();

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
    await adminContext2.close();
  });
});
