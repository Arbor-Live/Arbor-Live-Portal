import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";

test.describe("venues page", () => {
  test("admin creates a venue from the side panel and finds it in the list", async ({ page }) => {
    test.setTimeout(120_000);
    const venueName = `E2E Venues Page ${Date.now()}`;

    await page.goto("/dashboard/events/venues");
    await expect(page.getByTestId("venues-page")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "New venue" }).first().click();

    const sheet = page.getByTestId("venue-sheet");
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole("textbox").first().fill(venueName);
    await sheet.getByRole("button", { name: "Create venue", exact: true }).click();

    const venue = await pollConvex<{ venueId: string; name: string }>(
      "e2eHelpers:getLatestVenueByName",
      { name: venueName },
      (row) => row?.name === venueName,
    );
    await page.getByLabel("Search venues").fill(venueName);
    await expect(page.getByTestId(`venue-row-${venue.venueId}`)).toBeVisible({ timeout: 20_000 });
  });
});
