import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { bandAuthFile } from "../helpers/auth";

test.describe("event artist needed", () => {
  test("staff opens a slot, an artist requests to perform, and it flips to inquiring", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);

    const caption = `E2E caption ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Artist Need ${Date.now()}`,
      marketingCaption: caption,
    }) as { path: string; title: string };

    await page.goto(`${seeded.path}/artists`);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No one on the bill yet")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Add to bill" }).click();
    await page.getByRole("radio", { name: "Open position" }).click();
    await page.getByRole("button", { name: "Add position" }).click();
    const slot = page.getByTestId("bill-card").first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("artist-need-status")).toHaveText("Open");

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto("/dashboard/opportunities");
    await expect(bandPage.getByRole("heading", { name: "Opportunities" })).toBeVisible({
      timeout: 30_000,
    });

    const row = bandPage
      .getByTestId("opportunity-row")
      .filter({ hasText: seeded.title })
      .first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    // The website-visible design's caption shows on the row and in the panel.
    await expect(row).toContainText(caption);
    await row.getByRole("button", { name: "Inquire" }).click();

    const sheet = bandPage.getByTestId("opportunity-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByText(caption)).toBeVisible();
    // A tentative event has no public page, so there is no link to it.
    await expect(sheet.getByRole("link", { name: /View event page/ })).toHaveCount(0);

    await sheet.getByLabel("Note to Operations (optional)").fill("We would love to play this show.");
    await sheet.getByRole("button", { name: "Send inquiry" }).click();

    await expect(row.getByText("Requested")).toBeVisible({ timeout: 20_000 });
    await expect(bandPage.getByRole("heading", { name: "My requests" })).toBeVisible();
    await expect(bandPage.getByText(/submitted/i).first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("artist-need-status")).toHaveText("Inquiring", {
      timeout: 30_000,
    });
    // Inquiries are listed in the position's side panel.
    await page.getByTestId("bill-card").first().getByRole("button", { name: /Inquiring/ }).click();
    await expect(page.getByText("We would love to play this show.")).toBeVisible({
      timeout: 20_000,
    });

    await bandContext.close();
  });

  test("a listable show links the opportunity to its public event page", async ({ browser }) => {
    test.setTimeout(120_000);

    const caption = `E2E public caption ${Date.now()}`;
    const posterUrl = `${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/promo/coho.jpg`;
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Public Need ${Date.now()}`,
      status: "ready",
      marketingCaption: caption,
      marketingImageUrl: posterUrl,
      openPosition: true,
    }) as { eventId: string; path: string; title: string };

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto("/dashboard/opportunities");
    const row = bandPage
      .getByTestId("opportunity-row")
      .filter({ hasText: seeded.title })
      .first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    // The poster comes from the event's website-visible marketing design.
    await expect(row.locator("img")).toHaveAttribute("src", posterUrl, { timeout: 20_000 });
    await row.getByRole("button", { name: "Inquire" }).click();

    const sheet = bandPage.getByTestId("opportunity-sheet");
    const link = sheet.getByRole("link", { name: /View event page/ });
    await expect(link).toBeVisible({ timeout: 20_000 });
    await expect(link).toHaveAttribute("href", new RegExp(`/events/${seeded.eventId}$`));

    await bandContext.close();
  });

  test("the artist sees their set and soundcheck windows", async ({ browser }) => {
    test.setTimeout(120_000);

    const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: e2eEnv.bandEmail,
      password: e2eEnv.bandPassword,
      name: e2eEnv.bandName,
      bandName: e2eEnv.bandOrgName,
    }) as { organizationId: string };

    const now = Date.now();
    const showStartsAt = now + 2 * 60 * 60 * 1000;
    const seeded = runConvex("e2eHelpers:seedUpcomingBandShow", {
      organizationId: band.organizationId,
      eventTitle: `E2E Lineup ${Date.now()}`,
      setStartsAt: showStartsAt + 60 * 60 * 1000,
      setEndsAt: showStartsAt + 90 * 60 * 1000,
      soundcheckStartsAt: showStartsAt - 60 * 60 * 1000,
      soundcheckEndsAt: showStartsAt - 30 * 60 * 1000,
    }) as { eventTitle: string };

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto("/dashboard");
    await expect(bandPage.getByRole("heading", { name: "Your shows" })).toBeVisible({
      timeout: 30_000,
    });

    const row = bandPage.getByTestId("band-show-row").filter({ hasText: seeded.eventTitle }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText(/Set \d/)).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText(/Soundcheck \d/)).toBeVisible({ timeout: 20_000 });

    await bandContext.close();
  });

  test("the artist portal is band-only", async ({ page }) => {
    await page.goto("/dashboard/opportunities");
    await expect(page.getByText("Artist Organization Only")).toBeVisible({ timeout: 30_000 });
  });
});
