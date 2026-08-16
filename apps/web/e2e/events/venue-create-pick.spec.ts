import { test, expect } from "@playwright/test";
import { fillDateTimeRangeNearLabel } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";

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
    await expect(page.getByText("Create Event").first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Title", { exact: true }) })
      .getByRole("textbox")
      .fill(eventTitle);

    await fillDateTimeRangeNearLabel(page, "Start", {
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
    await menu.locator("input").first().fill(venueName);
    await menu.getByRole("button", { name: /Create venue/i }).click();
    await expect(page.getByText("Create venue").first()).toBeVisible({ timeout: 10_000 });
    // Dialog name field should already be filled from the query.
    await page.getByRole("button", { name: /Create & select|Create and select/i }).click();

    await page.getByRole("button", { name: "Create Event" }).first().click();
    await page.waitForURL(/\/dashboard\/events\/(?!new(?:\/|$))[^/?#]+/, { timeout: 45_000 });
    await expect(page.getByText("Edit Event").first()).toBeVisible({ timeout: 20_000 });

    const venue = await pollConvex<{
      venueId: string;
      name: string;
      path: string;
    }>(
      "e2eHelpers:getLatestVenueByName",
      { name: venueName },
      (row) => row?.name === venueName,
    );

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
