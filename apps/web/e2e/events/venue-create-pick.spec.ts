import { test, expect } from "@playwright/test";
import { fillDateTimeRangeNearLabel } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";
import { fillSearchableSelectQuery } from "../helpers/select";

test.describe("venue create and pick", () => {
  test("admin creates a venue via picker on a new event", async ({ page }) => {
    const stamp = Date.now();
    const venueName = `E2E Venue ${stamp}`;
    const eventTitle = `E2E Venue Event ${stamp}`;
    const now = new Date();
    const dayLabel = String(
      Math.min(28, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()),
    );

    await page.goto("/dashboard/events/new");
    await expect(page.getByText("Create event").first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox")
      .fill(eventTitle);

    await fillDateTimeRangeNearLabel(page, "When", {
      dayLabel,
      startTime: "6:00 PM",
      endTime: "10:00 PM",
    });

    // Create via VenuePicker (avoids searching a large venues catalog).
    const venueField = page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Venue", { exact: true }) });
    await venueField.getByTestId("searchable-select-trigger").click();
    const menu = page.getByTestId("searchable-select-menu");
    await expect(menu).toBeVisible({ timeout: 20_000 });
    await fillSearchableSelectQuery(menu, venueName);
    await menu.getByRole("button", { name: /Create venue/i }).click();
    const createDialog = page.getByTestId("venue-create-dialog");
    await expect(createDialog).toBeVisible({ timeout: 10_000 });
    // Name is already filled from the query; crew emails need the location.
    await createDialog.getByLabel("Address").fill("459 Lagunita Dr, Stanford, CA 94305");
    await createDialog.getByLabel("Google Maps link").fill("https://maps.app.goo.gl/e2e");
    await createDialog.getByRole("button", { name: /Create & select/i }).click();
    await expect(createDialog).toHaveCount(0);

    await page.getByRole("button", { name: "Create event" }).first().click();
    await page.waitForURL(/\/dashboard\/events\/(?!new(?:\/|$))[^/?#]+/, { timeout: 45_000 });
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 20_000 });

    const venue = await pollConvex<{
      venueId: string;
      name: string;
      path: string;
      address: string | null;
      googleMapsUrl: string | null;
    }>(
      "e2eHelpers:getLatestVenueByName",
      { name: venueName },
      (row) => row?.name === venueName,
    );
    expect(venue.address).toBe("459 Lagunita Dr, Stanford, CA 94305");
    expect(venue.googleMapsUrl).toBe("https://maps.app.goo.gl/e2e");

    const eventId = page.url().replace(/\/$/, "").split("/").pop()!;
    const eventState = await pollConvex<{
      venueId: string | null;
      venueName: string | null;
      title: string;
    }>(
      "e2eHelpers:getEventVenueState",
      { eventId },
      (row) => row?.venueId === venue.venueId,
    );
    expect(eventState.title).toBe(eventTitle);
    expect(eventState.venueName).toContain(venueName);
  });
});
