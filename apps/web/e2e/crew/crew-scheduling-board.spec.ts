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

    // `seedCrewedEventWithSchedule` lands exactly 16 days out, past the default
    // window. Bracket that single day (the range deep-links via ?from=&to=) so
    // the board stays short even as seeded events pile up on the shared deployment.
    await page.goto(`/dashboard/events/crew-scheduling?from=${toDateInput(15)}&to=${toDateInput(17)}`);
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Waiting on answers")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("date-picker").first()).toHaveAttribute("data-value", toDateInput(15));

    // Seeded events have sections but no slots yet — clear the filter to list
    // every crewed event in range.
    const needsCrewOnly = page.getByRole("checkbox", { name: "Needs crew only" });
    await needsCrewOnly.click();
    await expect(needsCrewOnly).not.toBeChecked();

    const card = page.getByTestId("crew-board-event").filter({ hasText: seeded.title }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Yes 1/)).toBeVisible({ timeout: 20_000 });

    await card.getByRole("button", { name: "Show answers" }).click();
    await expect(card.getByText(e2eEnv.crewName).first()).toBeVisible({ timeout: 20_000 });

    await card.getByRole("link", { name: "Assign crew" }).click();
    await page.waitForURL(new RegExp(`/dashboard/events/${seeded.eventId}/schedule`), {
      timeout: 30_000,
    });
    await expect(page.getByTestId("run-of-show")).toBeVisible({
      timeout: 30_000,
    });
  });
});
