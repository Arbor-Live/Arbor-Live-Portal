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

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      eventTitle: `E2E Artist Need ${Date.now()}`,
    }) as { eventPath: string; eventTitle: string };

    await page.goto(`${seeded.eventPath}/artists`);
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No open slots")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Add slot" }).click();
    const slot = page.getByTestId("artist-need-slot").first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("artist-need-status")).toHaveText("Open");

    const bandContext = await browser.newContext({ storageState: bandAuthFile });
    const bandPage = await bandContext.newPage();
    await bandPage.goto("/dashboard/opportunities");
    await expect(bandPage.getByText("Open artist needs")).toBeVisible({ timeout: 30_000 });

    const row = bandPage.locator("li").filter({ hasText: seeded.eventTitle }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Request to perform" }).click();
    await bandPage.locator("textarea").fill("We would love to play this show.");
    await bandPage.getByRole("button", { name: "Send request" }).click();

    await expect(row.getByText("Requested")).toBeVisible({ timeout: 20_000 });
    await expect(bandPage.getByText("My requests")).toBeVisible();
    await expect(bandPage.getByText("Submitted")).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("artist-need-status")).toHaveText("Inquiring", {
      timeout: 30_000,
    });
    await expect(page.getByText("We would love to play this show.")).toBeVisible({
      timeout: 20_000,
    });

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

    const card = bandPage
      .locator("div.rounded-lg.border")
      .filter({ hasText: seeded.eventTitle })
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/Set: /)).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/Soundcheck: /)).toBeVisible({ timeout: 20_000 });

    await bandContext.close();
  });

  test("the artist portal is band-only", async ({ page }) => {
    await page.goto("/dashboard/opportunities");
    await expect(page.getByText("Artist Organization Only")).toBeVisible({ timeout: 30_000 });
  });
});
