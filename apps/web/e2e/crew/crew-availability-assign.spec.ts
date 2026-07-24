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
  test("admin can assign yes responder to all blocks and save", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };

    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Assign ${Date.now()}`,
    }) as { schedulePath: string; eventId: string; title: string };

    runConvex("e2eHelpers:seedCrewYesResponse", {
      eventId: seeded.eventId,
      userId: crew.userId,
    });

    await page.goto(seeded.schedulePath);
    // Avoid matching the loading copy ("Loading crew availability...") via substring.
    await expect(page.getByRole("button", { name: "All blocks" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(e2eEnv.crewName, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "All blocks" }).click();
    await page.getByRole("button", { name: /Save Schedule & Personnel/i }).first().click();
    await expect(page.getByText(/On schedule/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
