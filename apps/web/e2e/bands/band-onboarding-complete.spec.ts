import { test, expect, type Page } from "@playwright/test";
import { signInWithCredentials } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

/**
 * Dedicated band org so finishing onboarding here never flips the shared
 * `e2eEnv.bandEmail` account the e-sign spec signs in as.
 */
const onboardingBandEmail = "e2e-onboarding-band@arborlive.test";
const onboardingBandName = "E2E Onboarding Payee";
const hourlyRateUsd = 125;

async function next(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

test.describe("band onboarding wizard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a band can finish identity, rates, and payout acknowledgement", async ({ page }) => {
    test.setTimeout(120_000);

    const stamp = Date.now();
    const bandDisplayName = `E2E Onboarded Band ${stamp}`;

    const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: onboardingBandEmail,
      password: e2eEnv.bandPassword,
      name: onboardingBandName,
      bandName: `E2E Onboarding Band ${stamp}`,
      // Own slug — `ensureBandPayeeUser` otherwise reuses the shared e-sign org.
      orgSlug: "e2e-onboarding-band",
    }) as { userId: string; organizationId: string };
    runConvex("e2eHelpers:resetBandOnboarding", { organizationId: band.organizationId });

    await signInWithCredentials(page, onboardingBandEmail, e2eEnv.bandPassword);

    await page.goto("/onboarding/band");
    await expect(page.getByText("Welcome to Arbor Live").first()).toBeVisible({
      timeout: 30_000,
    });
    await next(page);

    // Identity
    await expect(page.getByLabel("Band name")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Band name").fill(bandDisplayName);
    await page.getByLabel("Bio").fill("Seeded by the Playwright band onboarding spec.");
    await next(page);

    // Passkey is optional — skip enrollment in CI.
    await expect(page.getByText("Secure your account").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Add later", exact: true }).click();

    // Hero photo is optional — skip the upload (no R2 in CI).
    await expect(page.getByText("Add a hero photo").first()).toBeVisible({ timeout: 20_000 });
    await next(page);

    // Socials are all optional; leave the public listing off.
    await expect(page.getByLabel("Instagram URL")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Instagram URL").fill("https://instagram.com/e2e-band");
    await next(page);

    // Members — perform solo so no bandmate invites are sent.
    await page.getByRole("button", { name: /performing solo/i }).click();
    await next(page);

    // Rates & payout — payee is pre-seeded; confirm recommended ASSU pickup.
    const rateField = page.getByLabel("Performer hourly rate (USD)");
    await expect(rateField).toBeVisible({ timeout: 20_000 });
    await rateField.fill(String(hourlyRateUsd));
    await page.getByLabel(/Pickup \(ASSU office\)/i).check();
    await next(page);

    // Payout explainer — the last step submits with "Finish setup", not "Next".
    await page.getByRole("button", { name: /understand how payouts work/i }).click();
    await page.getByRole("button", { name: "Finish setup" }).click();

    const state = await pollConvex<{
      status: string;
      identityCompleted: boolean;
      ratesPayeeCompleted: boolean;
      paymentExplained: boolean;
      soloAcknowledged: boolean;
      displayName: string | null;
      performerHourlyRateUsd: number | null;
      designatedPayeeName: string | null;
      designatedPayeePayoutMethod: "pickup" | "delivery" | null;
    }>(
      "e2eHelpers:getBandOnboardingState",
      { organizationId: band.organizationId },
      (row) => row?.status === "completed" && row.displayName === bandDisplayName,
    );
    expect(state.identityCompleted).toBe(true);
    expect(state.ratesPayeeCompleted).toBe(true);
    expect(state.paymentExplained).toBe(true);
    expect(state.soloAcknowledged).toBe(true);
    expect(state.displayName).toBe(bandDisplayName);
    expect(state.performerHourlyRateUsd).toBe(hourlyRateUsd);
    expect(state.designatedPayeeName).toBe(onboardingBandName);
    expect(state.designatedPayeePayoutMethod).toBe("pickup");

    // Completed onboarding sends the wizard back to the dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(/Finish setting up your band profile/i)).toHaveCount(0);
  });
});
