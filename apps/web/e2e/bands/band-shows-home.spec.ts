import { test, expect } from "@playwright/test";
import { bandAuthFile, selectSearchableOption } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { e2eTestEmail } from "../helpers/email";
import { pollConvex, runConvex } from "../helpers/convex";
import { pickSelectOption } from "../helpers/select";

function ensurePayee() {
  return runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: e2eEnv.bandEmail,
    password: e2eEnv.bandPassword,
    name: e2eEnv.bandName,
    bandName: e2eEnv.bandOrgName,
  }) as {
    userId: string;
    organizationId: string;
    email: string;
    bandName: string;
  };
}

test.describe("band shows home", () => {
  test.use({ storageState: bandAuthFile });

  test.beforeAll(() => {
    ensurePayee();
  });

  test("band lands on Your shows home", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your shows" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Upcoming bookings and payout status").first()).toBeVisible();

    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Media", exact: true })).toBeVisible();
  });

  test("upcoming assigned show appears with no-payout chip", async ({ page }) => {
    const band = ensurePayee();
    const seeded = runConvex("e2eHelpers:seedUpcomingBandShow", {
      organizationId: band.organizationId,
      eventTitle: `E2E Band Home ${Date.now()}`,
    }) as { eventTitle: string };

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your shows" })).toBeVisible({
      timeout: 30_000,
    });
    const row = page.getByTestId("band-show-row").filter({ hasText: seeded.eventTitle }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("No payout yet")).toBeVisible();
    await expect(row.getByText(/Headliner/)).toBeVisible();
  });

  test("a show opens its detail panel, and ?show= deep-links to it", async ({ page }) => {
    const band = ensurePayee();
    const now = Date.now();
    const showStartsAt = now + 2 * 60 * 60 * 1000;
    const seeded = runConvex("e2eHelpers:seedUpcomingBandShow", {
      organizationId: band.organizationId,
      eventTitle: `E2E Show Sheet ${now}`,
      setStartsAt: showStartsAt + 60 * 60 * 1000,
      setEndsAt: showStartsAt + 90 * 60 * 1000,
    }) as { eventId: string; eventTitle: string };

    await page.goto("/dashboard");
    const row = page.getByTestId("band-show-row").filter({ hasText: seeded.eventTitle }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByText(seeded.eventTitle, { exact: true }).click();

    const sheet = page.getByTestId("band-show-sheet");
    await expect(sheet.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByText("Your times")).toBeVisible();
    await expect(sheet.getByText("E2E Stage").first()).toBeVisible();
    await expect(sheet.getByText("No payout yet").first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]show=${seeded.eventId}`));

    await page.goto(`/dashboard?show=${seeded.eventId}`);
    await expect(
      page.getByTestId("band-show-sheet").getByText(seeded.eventTitle).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the artist picks a rider for one show from its panel", async ({ page }) => {
    const band = ensurePayee();
    const stamp = Date.now();
    // The shared deployment piles up riders across runs; start from none.
    runConvex("e2eHelpers:clearBandRiders", { organizationId: band.organizationId });
    const acoustic = runConvex("e2eHelpers:seedBandRider", {
      organizationId: band.organizationId,
      name: `E2E Acoustic ${stamp}`,
      isDefault: false,
    }) as { riderId: string; name: string };
    const seeded = runConvex("e2eHelpers:seedUpcomingBandShow", {
      organizationId: band.organizationId,
      eventTitle: `E2E Show Rider ${stamp}`,
    }) as { eventId: string; eventTitle: string };

    await page.goto(`/dashboard?show=${seeded.eventId}`);
    const sheet = page.getByTestId("band-show-sheet");
    await expect(sheet.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 30_000 });

    await pickSelectOption(page, sheet.getByLabel("Rider for this show"), acoustic.name);
    await expect(sheet.getByText(`Crew will use ${acoustic.name}.`)).toBeVisible({
      timeout: 20_000,
    });

    await page.reload();
    await expect(
      page.getByTestId("band-show-sheet").getByLabel("Rider for this show"),
    ).toHaveText(acoustic.name, { timeout: 30_000 });
  });

  test("payee can e-sign from the Needs you group", async ({ page }) => {
    const band = ensurePayee();
    const seeded = runConvex("e2eHelpers:seedBandPaymentForEsign", {
      organizationId: band.organizationId,
      payeeUserId: band.userId,
      payeeName: e2eEnv.bandName,
      payeeEmail: band.email,
      status: "awaiting_confirmation",
      eventTitle: `E2E Home Esign ${Date.now()}`,
    }) as { paymentId: string; eventTitle: string };

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your shows" })).toBeVisible({
      timeout: 30_000,
    });
    const row = page
      .getByTestId("band-shows-needs-you")
      .getByTestId("band-show-row")
      .filter({ hasText: seeded.eventTitle })
      .first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("Needs signature")).toBeVisible();
    await row.getByRole("button", { name: "E-sign", exact: true }).click();

    await expect(page.getByText("E-sign payment").first()).toBeVisible();
    await page.getByRole("checkbox", { name: /I agree to the payment amount/ }).check();
    await page.locator("#band-payment-sign-name").fill(e2eEnv.bandName);
    await page.getByRole("button", { name: "Submit signature" }).click();

    await pollConvex(
      "e2eHelpers:getBandPaymentState",
      { paymentId: seeded.paymentId },
      (row: { status: string } | null) => row?.status === "confirmed",
    );
  });
});

test.describe("staff band assignment on event", () => {
  test("admin assigns a band, emails them, and the show appears on band home", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);

    const band = ensurePayee();
    const seeded = runConvex("e2eHelpers:seedUpcomingBandShow", {
      eventTitle: `E2E Assign ${Date.now()}`,
    }) as { eventPath: string; eventTitle: string };

    const afterCreatedAt = Date.now() - 1_000;
    await page.goto(`${seeded.eventPath}/artists`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Artists").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Add to bill" }).click();
    await selectSearchableOption(page, "Artist", band.bandName);
    await page.getByRole("button", { name: "Assign artist" }).click();

    await expect(page.getByText(band.bandName).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("No payout").first()).toBeVisible();

    const email = await pollConvex<{ template: string; to: string; subject: string }>(
      "e2eHelpers:getLatestEmailNotification",
      {
        to: e2eEnv.bandEmail,
        template: "band_assigned",
        afterCreatedAt,
      },
      (row) => row?.template === "band_assigned",
    );
    expect(email.to.toLowerCase()).toBe(e2eEnv.bandEmail.toLowerCase());
    expect(email.subject).toMatch(/You're on the bill/i);

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto("/dashboard");
    await expect(bandPage.getByRole("heading", { name: "Your shows" })).toBeVisible({
      timeout: 30_000,
    });
    const row = bandPage
      .getByTestId("band-show-row")
      .filter({ hasText: seeded.eventTitle })
      .first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("No payout yet")).toBeVisible();
    await bandContext.close();
  });

  test("admin invites a new band with payout from the event page", async ({ page }) => {
    test.setTimeout(120_000);

    const stamp = Date.now();
    const bandName = `E2E Invite Band ${stamp}`;
    const contactEmail = e2eTestEmail(`invite-${stamp}`);
    const seeded = runConvex("e2eHelpers:seedUpcomingBandShow", {
      eventTitle: `E2E Invite Flow ${stamp}`,
    }) as { eventPath: string; eventTitle: string };

    const afterCreatedAt = Date.now() - 1_000;
    await page.goto(`${seeded.eventPath}/artists`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 30_000 });
    const bandsCard = page.locator('[data-slot="card"]').filter({
      has: page.getByRole("button", { name: "Add to bill" }),
    });
    await expect(bandsCard).toBeVisible({ timeout: 20_000 });

    await bandsCard.getByRole("button", { name: "Add to bill" }).click();
    await page.getByRole("radio", { name: "Invite by email" }).click();
    await page.locator("#invite-band-artist-name").fill(bandName);
    await page.locator("#invite-band-email").fill(contactEmail);
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText(bandName).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Onboarding").first()).toBeVisible();
    await expect(page.getByText("$600.00").first()).toBeVisible();

    const portalInvite = await pollConvex<{ template: string; to: string }>(
      "e2eHelpers:getLatestEmailNotification",
      {
        to: contactEmail,
        template: "user_invite",
        afterCreatedAt,
      },
      (row) => row?.template === "user_invite",
    );
    expect(portalInvite.to.toLowerCase()).toBe(contactEmail.toLowerCase());

    const eventInvite = await pollConvex<{ template: string; to: string; subject: string }>(
      "e2eHelpers:getLatestEmailNotification",
      {
        to: contactEmail,
        template: "band_event_onboarding_invite",
        afterCreatedAt,
      },
      (row) => row?.template === "band_event_onboarding_invite",
    );
    expect(eventInvite.to.toLowerCase()).toBe(contactEmail.toLowerCase());
    expect(eventInvite.subject).toMatch(/Finish onboarding for/i);
  });
});
