import { test, expect, type Page } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

test.describe("crew availability respond", () => {
  test.use({ storageState: crewAuthFile });

  test("crew can say they're free for the night of a matching seeded event", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    // Seeded events share a night across runs; start that night unanswered.
    runConvex("e2eHelpers:resetCrewAvailability", { userId: crew.userId, clearNights: true });
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Availability ${Date.now()}`,
    }) as { eventId: string; title: string };

    await page.goto("/dashboard/events/my-availability");
    await expect(page.getByText("My availability").first()).toBeVisible({ timeout: 20_000 });
    const main = page.getByRole("main");
    await expect(main.getByText(seeded.title).first()).toBeVisible({ timeout: 25_000 });

    // One card per night; one tap answers it for every event that night.
    const night = main.getByTestId("crew-night").filter({ hasText: seeded.title }).first();
    await night.getByRole("radio", { name: /I'm free|Confirm/ }).click();
    await expect(
      main.getByTestId("crew-night").filter({ hasText: seeded.title }).getByText("You: Free all night"),
    ).toBeVisible({ timeout: 20_000 });
  });
});

async function waitForAvailableCrewChip(page: Page, name: string) {
  const allBlocks = page.getByTestId("crew-candidate").filter({ hasText: name }).first();
  // Local Convex can stall the first subscription burst; one reload usually recovers.
  try {
    await expect(allBlocks).toBeVisible({ timeout: 45_000 });
  } catch {
    await page.reload();
    await expect(page.getByTestId("run-of-show")).toBeVisible({
      timeout: 30_000,
    });
    await expect(allBlocks).toBeVisible({ timeout: 60_000 });
  }
  return allBlocks;
}

test.describe("schedule assign from yes response", () => {
  test("admin can assign yes responder on the schedule page and save", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Assign ${Date.now()}`,
    }) as { schedulePath: string; eventId: string };

    runConvex("e2eHelpers:seedCrewYesResponse", {
      eventId: seeded.eventId,
      userId: crew.userId,
    });

    await page.goto(seeded.schedulePath);
    await expect(page.getByTestId("run-of-show")).toBeVisible({
      timeout: 30_000,
    });

    // The yes responder is offered on each section; one click puts them on it.
    const chip = await waitForAvailableCrewChip(page, e2eEnv.crewName);
    await chip.click();
    await expect(page.getByTestId("crew-staffing-summary")).toContainText("1 of 1 filled");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect
      .poll(
        () =>
          (
            runConvex("e2eHelpers:getEventCrewAssignmentState", {
              eventId: seeded.eventId,
            }) as { assignedUserIds: string[] }
          ).assignedUserIds,
        { timeout: 30_000 },
      )
      .toContain(crew.userId);
  });
});
