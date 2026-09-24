import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { bandAuthFile } from "../helpers/auth";

test.describe("event artist needed", () => {
  test("staff posts a need, an artist requests to perform, and it flips to inquiring", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      eventTitle: `E2E Artist Need ${Date.now()}`,
    }) as { eventPath: string; eventTitle: string };

    await page.goto(`${seeded.eventPath}/artists`);
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 30_000 });

    const needCard = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "Artist Needed" }) })
      .first();
    await expect(needCard).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("artist-need-status")).toHaveText("Open");

    await needCard.getByRole("button", { name: "Post an artist need" }).click();
    await expect(needCard.getByRole("button", { name: "Save need" })).toBeVisible({
      timeout: 20_000,
    });

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

  test("the artist portal is band-only", async ({ page }) => {
    await page.goto("/dashboard/opportunities");
    await expect(page.getByText("Artist Organization Only")).toBeVisible({ timeout: 30_000 });
  });
});
