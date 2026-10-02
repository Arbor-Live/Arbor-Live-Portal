import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";

test.describe("marketing design board", () => {
  test("lists my poster work and opens it with the event's details", async ({ page }) => {
    test.setTimeout(120_000);

    const { userId } = runConvex("e2eHelpers:getUserIdByEmail", { email: e2eEnv.adminEmail }) as {
      userId: string;
    };
    const stamp = Date.now();
    const title = `E2E Poster Work ${stamp}`;
    const act = `E2E Poster Act ${stamp}`;
    const { eventId } = runConvex("e2eHelpers:seedPosterWork", {
      eventTitle: title,
      assigneeUserId: userId,
      externalArtistName: act,
    }) as { eventId: string };

    await page.goto("/dashboard/marketing/designs");
    await expect(page.getByRole("heading", { name: "Design board" })).toBeVisible({ timeout: 30_000 });
    // Designers land on their own work.
    await expect(page.getByTestId("filter-chip-designer")).toContainText("Me");

    const row = page.getByTestId("design-board-row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("E2E Poster Hall");
    await expect(row).toContainText("Needs poster");

    // The main area is the first button; the ⋯ menu ("More for …") follows it.
    await row.getByRole("button").first().click();
    const sheet = page.getByTestId("design-board-sheet");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`event=${eventId}`));
    await expect(sheet).toContainText("E2E Poster Hall");
    await expect(sheet).toContainText("E2E Poster Host");
    await expect(sheet).toContainText("Doors");
    await expect(sheet).toContainText("Show");
    const lineup = sheet.getByTestId("poster-brief-lineup");
    await expect(lineup).toContainText(act);
    await expect(lineup).toContainText("Opener (to be announced)");
    // The act with a set time is listed before the one without.
    await expect(lineup.getByRole("listitem").first()).toContainText(act);

    // A deep link reopens the panel.
    await page.reload();
    await expect(page.getByTestId("design-board-sheet")).toContainText(act, { timeout: 30_000 });
  });
});
