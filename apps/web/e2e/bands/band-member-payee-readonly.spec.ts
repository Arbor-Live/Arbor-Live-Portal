import { test, expect, type Page } from "@playwright/test";
import { signInWithCredentials } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

/**
 * Only an artist admin can change who gets paid. A plain member used to see an
 * editable payee form and an onboarding step they could not finish; now they
 * see the payee read-only, are told whom to ask, and onboarding moves on.
 *
 * Own org so the shared band fixtures keep their admin.
 */
const orgSlug = "e2e-member-payee-band";
const adminEmail = "e2e-member-payee-admin@arborlive.test";
const adminName = "E2E Payee Admin";
const memberEmail = "e2e-member-payee-member@arborlive.test";
const notice = `Only your artist admin can set the payee. Ask ${adminName}.`;

function seedBand() {
  const bandName = "E2E Member Payee Band";
  runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: adminEmail,
    password: e2eEnv.bandPassword,
    name: adminName,
    bandName,
    orgSlug,
  });
  return runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: memberEmail,
    password: e2eEnv.bandPassword,
    name: "E2E Payee Member",
    bandName,
    orgSlug,
    membershipRole: "org_member",
  }) as { userId: string; organizationId: string };
}

async function next(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

test.describe.serial("band member payee access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(120_000);

  test("a member sees the payee read-only with whom to ask", async ({ page }) => {
    seedBand();
    await signInWithCredentials(page, memberEmail, e2eEnv.bandPassword);

    await page.goto("/dashboard/artists/payments");
    await expect(page.getByTestId("band-payee-admin-only")).toHaveText(notice, {
      timeout: 30_000,
    });
    const fields = page.locator("#payee").getByRole("textbox");
    await expect(fields).toHaveCount(3);
    for (const field of await fields.all()) await expect(field).toBeDisabled();
    await expect(page.locator("#payee").getByRole("combobox", { name: "Select payee" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  });

  test("a member can finish the onboarding rates step without setting the payee", async ({
    page,
  }) => {
    const band = seedBand();
    runConvex("e2eHelpers:resetBandOnboarding", { organizationId: band.organizationId });
    await signInWithCredentials(page, memberEmail, e2eEnv.bandPassword);

    await page.goto("/onboarding/artist");
    await expect(page.getByText("Welcome to Arbor Live").first()).toBeVisible({ timeout: 30_000 });
    await next(page);

    await expect(page.getByLabel("Artist name")).toBeVisible({ timeout: 20_000 });
    await next(page);
    await expect(page.getByText("Secure your account").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Add later", exact: true }).click();
    await expect(page.getByText("Add a hero photo").first()).toBeVisible({ timeout: 20_000 });
    await next(page);
    await expect(page.getByPlaceholder("https://...").first()).toBeVisible({ timeout: 20_000 });
    await next(page);
    await page.getByRole("button", { name: /performing solo/i }).click();
    await next(page);

    // Rates & payout: read-only for a member, and Next still advances.
    await expect(page.getByTestId("band-onboarding-payee-admin-only")).toContainText(notice, {
      timeout: 20_000,
    });
    await expect(page.getByLabel("Rate per person per hour (USD)")).toBeDisabled();
    await next(page);
    await expect(
      page.getByRole("button", { name: /understand how payouts work/i }),
    ).toBeVisible({ timeout: 20_000 });

    const state = await pollConvex<{ ratesPayeeCompleted: boolean }>(
      "e2eHelpers:getBandOnboardingState",
      { organizationId: band.organizationId },
      (row) => row?.ratesPayeeCompleted === true,
    );
    expect(state.ratesPayeeCompleted).toBe(true);
  });
});
