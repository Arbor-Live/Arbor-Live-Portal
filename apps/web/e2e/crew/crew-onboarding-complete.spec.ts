import { test, expect, type Page } from "@playwright/test";
import { signInWithCredentials } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

/**
 * Dedicated user so completing onboarding here never flips the shared
 * `e2eEnv.crewEmail` account that availability/assign specs sign in as.
 */
const onboardingCrewEmail = "e2e-onboarding-crew@arborlive.test";
const onboardingCrewName = "E2E Onboarding Crew";

async function next(page: Page) {
  const nextBtn = page.getByRole("button", { name: "Next", exact: true });
  await expect(nextBtn).toBeEnabled();
  await nextBtn.click();
}

async function acknowledge(page: Page, label: RegExp) {
  const ack = page
    .locator("[data-slot=questionnaire-item][data-active]")
    .getByRole("button", { name: label });
  await expect(ack).toBeVisible({ timeout: 20_000 });
  await ack.click();
}

function activeStep(page: Page) {
  return page.locator("[data-slot=questionnaire-item][data-active]");
}

test.describe("crew onboarding wizard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a new crew member can finish every required step and sign", async ({ page }) => {
    test.setTimeout(120_000);

    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: onboardingCrewEmail,
      password: e2eEnv.crewPassword,
      name: onboardingCrewName,
    }) as { userId: string };
    runConvex("e2eHelpers:resetCrewOnboarding", { userId: crew.userId });

    await signInWithCredentials(page, onboardingCrewEmail, e2eEnv.crewPassword);

    await page.goto("/onboarding");
    await expect(activeStep(page).getByText("Welcome to Arbor Live")).toBeVisible({
      timeout: 30_000,
    });
    await next(page);

    // Profile
    await expect(page.getByLabel("Full name")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Full name").fill(onboardingCrewName);
    await page.getByLabel("Phone number").fill("6505550144");
    await next(page);

    // Passkey is optional — skip enrollment in CI.
    await expect(activeStep(page).getByText("Secure your account")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Add later", exact: true }).click();

    // WhatsApp
    await acknowledge(page, /joined the Arbor WhatsApp group/i);
    await next(page);

    // Instagram
    await acknowledge(page, /followed both Instagram accounts/i);
    await next(page);

    // Federal Work Study — answer No, then acknowledge the standard pay path.
    await expect(
      activeStep(page).getByText("Federal Work Study", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await activeStep(page).getByRole("button", { name: "No", exact: true }).click();
    await acknowledge(page, /don.t have Federal Work Study/i);
    await next(page);

    // Required training — every item, and no driver's license (skips cart training).
    await acknowledge(page, /watched the Narcan training video/i);
    await acknowledge(page, /sober monitors guide and completed the test/i);
    await acknowledge(page, /read the emergency SOPs/i);
    await acknowledge(page, /read the crew expectations/i);
    await acknowledge(page, /completed the lifting training/i);
    await activeStep(page).getByRole("button", { name: "No", exact: true }).click();
    await next(page);

    // Getting paid
    await acknowledge(page, /submitted the OSE hiring form/i);
    await next(page);

    // Logging hours
    await acknowledge(page, /log my hours in Sequoia/i);
    await next(page);

    // Signature
    await expect(page.getByLabel("Type your full legal name to sign")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByLabel("Type your full legal name to sign").fill(onboardingCrewName);
    await acknowledge(page, /agree to the onboarding terms/i);
    await page.getByRole("button", { name: "Sign & submit" }).click();

    const state = await pollConvex<{
      status: string;
      signatureLegalName: string | null;
      hasFederalWorkStudy: boolean | null;
      timecardAcknowledged: boolean;
      narcanCompleted: boolean;
    }>(
      "e2eHelpers:getCrewOnboardingState",
      { userId: crew.userId },
      (row) => row?.status === "completed",
    );
    expect(state.signatureLegalName).toBe(onboardingCrewName);
    expect(state.hasFederalWorkStudy).toBe(false);
    expect(state.timecardAcknowledged).toBe(true);
    expect(state.narcanCompleted).toBe(true);

    // Completed onboarding sends the wizard back to the dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(/Finish your crew onboarding/i)).toHaveCount(0);
  });
});
