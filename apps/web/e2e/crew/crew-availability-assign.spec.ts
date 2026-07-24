import { test, expect, type Page } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

test.describe("crew availability respond", () => {
  test.use({ storageState: crewAuthFile });

  test("crew can mark Yes on a matching seeded event", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Availability ${Date.now()}`,
    }) as { eventId: string; title: string };

    await page.goto("/dashboard/events/my-availability");
    await expect(page.getByText("My Availability").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(seeded.title).first()).toBeVisible({ timeout: 25_000 });

    const card = page.locator("div.rounded-md.border").filter({ hasText: seeded.title }).first();
    await card.getByText(/Yes — available for entire event/i).click();
    await card.getByRole("button", { name: "Submit response" }).click();
    await expect(page.getByText(/Saved Yes|You: Yes/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

async function waitForScheduleAssignControls(page: Page) {
  const allBlocks = page.getByRole("button", { name: "All blocks" });
  // Local Convex can stall the first subscription burst; one reload usually recovers.
  try {
    await expect(allBlocks).toBeVisible({ timeout: 45_000 });
  } catch {
    await page.reload();
    await expect(page.getByText("Schedule", { exact: true }).first()).toBeVisible({
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
    await expect(page.getByText("Schedule", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const allBlocks = await waitForScheduleAssignControls(page);
    await expect(page.getByText(e2eEnv.crewName, { exact: true }).first()).toBeVisible();

    await allBlocks.click();
    await page.getByRole("button", { name: /Save Schedule & Personnel/i }).first().click();
    await expect(page.getByText(/On schedule/i).first()).toBeVisible({ timeout: 30_000 });

    const state = runConvex("e2eHelpers:getEventCrewAssignmentState", {
      eventId: seeded.eventId,
    }) as { shiftCount: number; assignedUserIds: string[] };
    expect(state.shiftCount).toBeGreaterThan(0);
    expect(state.assignedUserIds).toContain(crew.userId);
  });
});
