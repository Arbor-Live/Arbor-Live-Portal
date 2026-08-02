import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { runConvex, pollConvex } from "../helpers/convex";
import { formField } from "../helpers/form";

/**
 * The "not worth a batch of their own" long tail, folded in here: the account
 * settings page (profile details edit → `account.updateMyProfileDetails`) and
 * the event editor's Artifacts tab (note/document create → `eventArtifacts`).
 * Both are small modules whose happy paths had no e2e at all.
 */
test.describe("account settings profile", () => {
  // The profile form writes the *shared admin* row, which every worktree signs
  // in as — restore it so a failed run cannot leave a fixture title/phone on
  // the account other specs depend on (same hazard as Batch 14).
  test.afterEach(() => {
    runConvex("e2eHelpers:setUserAdminProfileFields", {
      email: e2eEnv.adminEmail,
      title: undefined,
      phone: undefined,
      pronouns: undefined,
    });
  });

  test("profile title/phone/pronouns save and persist", async ({ page }) => {
    const stamp = Date.now();
    const nextTitle = `E2E Title ${stamp}`;
    const nextPhone = "6505550199";
    const nextPronouns = "they/them";

    await page.goto("/dashboard/account");
    await expect(page.getByText("Account settings").first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("Display name").first()).toBeVisible({ timeout: 25_000 });

    await formField(page, "Job title").fill(nextTitle);
    await formField(page, "Phone").fill(nextPhone);
    await formField(page, "Pronouns").fill(nextPronouns);
    await page.getByRole("button", { name: "Save profile" }).click();

    const state = await pollConvex<{
      title: string;
      phone: string;
      pronouns: string;
    }>(
      "e2eHelpers:getUserAdminStateByEmail",
      { email: e2eEnv.adminEmail },
      (row) =>
        !!(
          row?.title === nextTitle &&
          row?.phone === nextPhone &&
          row?.pronouns === nextPronouns
        ),
    );
    expect(state.title).toBe(nextTitle);
    expect(state.phone).toBe(nextPhone);
    expect(state.pronouns).toBe(nextPronouns);
  });
});

test.describe("event editor artifacts", () => {
  test("admin creates a note artifact on a seeded event", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Artifact ${Date.now()}`,
    }) as { eventId: string; path: string };

    await page.goto(`${seeded.path}/artifacts`);
    await expect(page.getByText("Artifacts", { exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });

    const noteTitle = `E2E Note ${Date.now()}`;
    await page.getByPlaceholder("Title").fill(noteTitle);
    await page.getByPlaceholder("Markdown/content").fill("**run sheet** notes here");
    await page.getByRole("button", { name: "Add Artifact" }).click();

    const state = await pollConvex<{ artifacts: Array<{ title: string; markdown: string }> }>(
      "e2eHelpers:getEventArtifactsState",
      { eventId: seeded.eventId },
      (row) => !!row?.artifacts.some((artifact) => artifact.title === noteTitle),
    );
    expect(state.artifacts.find((artifact) => artifact.title === noteTitle)?.markdown).toBe(
      "**run sheet** notes here",
    );

    await expect(page.getByText(noteTitle).first()).toBeVisible({ timeout: 25_000 });
  });
});
