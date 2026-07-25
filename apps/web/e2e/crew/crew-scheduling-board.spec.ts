import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

function toDateInput(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

test.describe("crew scheduling board", () => {
  test("admin can widen the range, read responses, and jump to assign", async ({ page }) => {
    test.setTimeout(120_000);

    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Board ${Date.now()}`,
    }) as { eventId: string; title: string };

    runConvex("e2eHelpers:seedCrewYesResponse", {
      eventId: seeded.eventId,
      userId: crew.userId,
    });

    await page.goto("/dashboard/events/crew-scheduling");
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });

    // `seedCrewedEventWithSchedule` lands exactly 16 days out, past the default
    // 2-week window. Bracket that single day so the board stays short even as
    // seeded events pile up on the shared deployment.
    await page.locator('input[type="date"]').first().fill(toDateInput(15));
    await page.locator('input[type="date"]').nth(1).fill(toDateInput(17));

    // Seeded events have schedule blocks but no shift slots, so they are not
    // "unconfirmed" — clear the filter to list every crewed event in range.
    await page.getByText("Unconfirmed only").click();
    await expect(page.locator('input[type="checkbox"]').first()).not.toBeChecked();

    const card = page.locator("div.rounded-md.border").filter({ hasText: seeded.title }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Yes 1/)).toBeVisible({ timeout: 20_000 });

    await card.getByRole("button", { name: "Show responses" }).click();
    await expect(card.getByText(e2eEnv.crewName).first()).toBeVisible({ timeout: 20_000 });

    await card.getByRole("link", { name: "Assign crew" }).click();
    await page.waitForURL(new RegExp(`/dashboard/events/${seeded.eventId}/schedule`), {
      timeout: 30_000,
    });
    await expect(page.getByText("Schedule", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
