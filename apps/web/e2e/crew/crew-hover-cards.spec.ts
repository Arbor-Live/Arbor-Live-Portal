import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

const CREW_PHONE = "650-555-0142";

/**
 * Crew contact details and hours: the staffing chips show quarter hours and a
 * hover card with phone + hours this week/quarter, and the event Contacts card
 * lists the crew on the event with their phones.
 */
test.describe("crew hover cards and phones", () => {
  test("staffing chip hover shows phone and hours; contacts list crew phones", async ({ page }) => {
    const stamp = Date.now();
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    runConvex("e2eHelpers:setProfilePhone", { userId: crew.userId, phone: CREW_PHONE });

    // Hours on another event this quarter.
    const worked = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Hours ${stamp}`,
    }) as { eventId: string; path: string };
    runConvex("e2eHelpers:seedAssignCrewToAllBlocks", {
      eventId: worked.eventId,
      userId: crew.userId,
      personName: e2eEnv.crewName,
    });

    const target = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Hover ${stamp}`,
    }) as { eventId: string; schedulePath: string };
    runConvex("e2eHelpers:seedCrewYesResponse", { eventId: target.eventId, userId: crew.userId });

    await page.goto(target.schedulePath);
    await expect(page.getByTestId("run-of-show")).toBeVisible({ timeout: 30_000 });
    const chip = page.getByTestId("crew-candidate").filter({ hasText: e2eEnv.crewName }).first();
    await expect(chip).toBeVisible({ timeout: 45_000 });
    await expect(chip).toContainText(/\d+(\.\d)?h/);

    await chip.hover();
    const card = page.getByTestId("user-hover-card");
    await expect(card).toContainText(CREW_PHONE, { timeout: 15_000 });
    await expect(card.getByTestId("user-hover-card-hours")).toContainText("This week");

    await page.goto(worked.path);
    const team = page.getByTestId("event-contacts-team");
    await expect(team).toContainText(e2eEnv.crewName, { timeout: 30_000 });
    await expect(team).toContainText(CREW_PHONE);
  });
});
