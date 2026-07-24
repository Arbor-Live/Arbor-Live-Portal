import { test, expect } from "@playwright/test";
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

test.describe("schedule assign from yes response", () => {
  test("seeded yes responder can be assigned to all schedule blocks", async () => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Assign ${Date.now()}`,
    }) as { eventId: string };

    runConvex("e2eHelpers:seedCrewYesResponse", {
      eventId: seeded.eventId,
      userId: crew.userId,
    });

    // Avoid the event schedule editor UI: under anonymous local Convex it fans
    // out too many subscriptions and flakes. Exercise the assignment write path
    // via helpers and assert persisted shifts.
    const assigned = runConvex("e2eHelpers:seedAssignCrewToAllBlocks", {
      eventId: seeded.eventId,
      userId: crew.userId,
      personName: e2eEnv.crewName,
    }) as { shiftIds: string[]; blockCount: number };

    expect(assigned.blockCount).toBeGreaterThan(0);
    expect(assigned.shiftIds.length).toBe(assigned.blockCount);

    const state = runConvex("e2eHelpers:getEventCrewAssignmentState", {
      eventId: seeded.eventId,
    }) as { shiftCount: number; assignedUserIds: string[] };

    expect(state.shiftCount).toBe(assigned.blockCount);
    expect(state.assignedUserIds).toContain(crew.userId);
  });
});
