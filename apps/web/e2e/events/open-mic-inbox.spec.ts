import { test, expect } from "@playwright/test";
import { runConvex, pollConvex } from "../helpers/convex";

type Night = {
  eventId: string;
  title: string;
  runnerPath: string;
};

/**
 * Admin Open Mic: the nights inbox (`/dashboard/events/open-mic`) and the
 * runner (`/dashboard/events/open-mic/[id]`). Fixtures are seeded with a start
 * 30 min out so the runner window is open — the inbox's "Go live" only renders
 * for a future night, and the runner's call-up / strike actions refuse while
 * the window is closed. Every test seeds its own night and `afterAll` removes
 * it through the fixture helper, so the shared deployment never accumulates
 * open nights that would leak into `getActiveNight`'s window.
 */
test.describe("open mic admin inbox and runner", () => {
  const eventIds: string[] = [];
  const stamp = Date.now();

  test.afterAll(() => {
    for (const eventId of eventIds) {
      runConvex("e2eHelpers:deleteOpenMicFixture", { eventId });
    }
  });

  function seedNight(extra?: { openMicStatus?: string }): Night {
    const night = runConvex("e2eHelpers:seedOpenMicNight", {
      title: `E2E Open Mic ${stamp} ${eventIds.length}`,
      openMicStatus: extra?.openMicStatus,
    }) as Night;
    eventIds.push(night.eventId);
    return night;
  }

  test("inbox lists the night with queued/performed counts and go live flips to live", async ({
    page,
  }) => {
    const night = seedNight();
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Queued One",
      email: `e2e.om.queued.${stamp}.1@stanford.edu`,
      whatTheyreDoing: "Comedy",
      position: 100,
    });
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Queued Two",
      email: `e2e.om.queued.${stamp}.2@stanford.edu`,
      whatTheyreDoing: "Song",
      position: 200,
    });
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Already Performed",
      email: `e2e.om.performed.${stamp}@stanford.edu`,
      whatTheyreDoing: "Dance",
      status: "performed",
      performedAt: Date.now() - 60 * 60 * 1000,
      position: 300,
    });

    await page.goto("/dashboard/events/open-mic");
    const row = page.locator("div.rounded-md.border.p-3").filter({ hasText: night.title }).first();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await expect(row.getByText("Scheduled")).toBeVisible();
    await expect(row.getByText("Runner: Open")).toBeVisible();
    await expect(row.getByText("Queued: 2")).toBeVisible();
    await expect(row.getByText("Performed: 1")).toBeVisible();

    await row.getByRole("button", { name: "Go live" }).click();
    const state = await pollConvex<{ openMicStatus?: string }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: night.eventId },
      (row) => row?.openMicStatus === "live",
    );
    expect(state.openMicStatus).toBe("live");
    await expect(row.getByText("Live")).toBeVisible({ timeout: 25_000 });
  });

  test("mark completed closes a live night and cancel closes a scheduled one", async ({
    page,
  }) => {
    const live = seedNight({ openMicStatus: "live" });
    await page.goto("/dashboard/events/open-mic");
    const liveRow = page
      .locator("div.rounded-md.border.p-3")
      .filter({ hasText: live.title })
      .first();
    await expect(liveRow).toBeVisible({ timeout: 25_000 });
    await liveRow.getByRole("button", { name: "Mark completed" }).click();
    const completed = await pollConvex<{ openMicStatus?: string }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: live.eventId },
      (row) => row?.openMicStatus === "completed",
    );
    expect(completed.openMicStatus).toBe("completed");

    const cancelled = seedNight();
    await page.goto("/dashboard/events/open-mic");
    const cancelRow = page
      .locator("div.rounded-md.border.p-3")
      .filter({ hasText: cancelled.title })
      .first();
    await expect(cancelRow).toBeVisible({ timeout: 25_000 });
    await cancelRow.getByRole("button", { name: "Cancel" }).click();
    const cancelledState = await pollConvex<{ openMicStatus?: string }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: cancelled.eventId },
      (row) => row?.openMicStatus === "cancelled",
    );
    expect(cancelledState.openMicStatus).toBe("cancelled");
  });

  test("disable removes the night from the inbox behind the confirm", async ({
    page,
  }) => {
    const night = seedNight();
    await page.goto("/dashboard/events/open-mic");
    const row = page.locator("div.rounded-md.border.p-3").filter({ hasText: night.title }).first();
    await expect(row).toBeVisible({ timeout: 25_000 });

    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Disable" }).click();

    const state = await pollConvex<{ openMicEnabled: boolean; eventExists: boolean }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: night.eventId },
      (row) => !!(row?.eventExists === false || row?.openMicEnabled === false),
    );
    expect(state.openMicEnabled).toBe(false);

    await expect(
      page.locator("div.rounded-md.border.p-3").filter({ hasText: night.title }),
    ).toHaveCount(0);
  });

  test("runner calls up the queue and advances performers to the leaderboard", async ({
    page,
  }) => {
    const night = seedNight();
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Runner Alpha",
      email: `e2e.om.alpha.${stamp}@stanford.edu`,
      whatTheyreDoing: "Set one",
      position: 100,
    });
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Runner Beta",
      email: `e2e.om.beta.${stamp}@stanford.edu`,
      whatTheyreDoing: "Set two",
      position: 200,
    });

    await page.goto(night.runnerPath);
    await expect(page.getByText("Call up next performer").first()).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("button", { name: "Call up next performer" }).click();

    const called = await pollConvex<{
      signups: Array<{ name: string; status: string }>;
    }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: night.eventId },
      (row) => !!row?.signups.some((s) => s.name === "E2E Runner Alpha" && s.status === "current"),
    );
    expect(called.signups.find((s) => s.name === "E2E Runner Alpha")?.status).toBe("current");
    await expect(page.getByText("E2E Runner Alpha").first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "Next performer" }).click();
    const advanced = await pollConvex<{
      signups: Array<{ name: string; status: string }>;
    }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: night.eventId },
      (row) =>
        !!(
          row?.signups.some((s) => s.name === "E2E Runner Alpha" && s.status === "performed") &&
          row.signups.some((s) => s.name === "E2E Runner Beta" && s.status === "current")
        ),
    );
    expect(advanced.signups.find((s) => s.name === "E2E Runner Alpha")?.status).toBe("performed");
    expect(advanced.signups.find((s) => s.name === "E2E Runner Beta")?.status).toBe("current");

    const leaderboardRow = page
      .locator("ol li")
      .filter({ hasText: "E2E Runner Alpha" })
      .first();
    await expect(leaderboardRow).toBeVisible({ timeout: 25_000 });
    await expect(leaderboardRow.getByText("1 set")).toBeVisible();
  });

  test("not here sends the current performer through the strike ladder", async ({
    page,
  }) => {
    const night = seedNight();
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Striker",
      email: `e2e.om.striker.${stamp}@stanford.edu`,
      whatTheyreDoing: "Guitar",
      status: "current",
      position: 100,
    });
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Next In Line",
      email: `e2e.om.next.${stamp}@stanford.edu`,
      whatTheyreDoing: "Song",
      position: 200,
    });

    await page.goto(night.runnerPath);
    await expect(page.getByText("E2E Striker").first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "Not here" }).click();
    const struck = await pollConvex<{
      signups: Array<{ name: string; status: string; skipsCount: number }>;
    }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: night.eventId },
      (row) =>
        !!(
          row?.signups.some((s) => s.name === "E2E Striker" && s.status === "queued" && s.skipsCount === 1) &&
          row.signups.some((s) => s.name === "E2E Next In Line" && s.status === "current")
        ),
    );
    expect(struck.signups.find((s) => s.name === "E2E Striker")?.skipsCount).toBe(1);
    expect(struck.signups.find((s) => s.name === "E2E Next In Line")?.status).toBe("current");
  });

  test("runner removes a signup behind the confirm", async ({ page }) => {
    const night = seedNight();
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Doomed",
      email: `e2e.om.doomed.${stamp}@stanford.edu`,
      whatTheyreDoing: "Comedy",
      status: "current",
      position: 100,
    });
    runConvex("e2eHelpers:seedOpenMicSignup", {
      eventId: night.eventId,
      name: "E2E Survivor",
      email: `e2e.om.survivor.${stamp}@stanford.edu`,
      whatTheyreDoing: "Song",
      position: 200,
    });

    await page.goto(night.runnerPath);
    await expect(page.getByText("E2E Doomed").first()).toBeVisible({ timeout: 25_000 });

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();

    const afterRemove = await pollConvex<{
      signups: Array<{ name: string; status: string }>;
    }>(
      "e2eHelpers:getOpenMicNightState",
      { eventId: night.eventId },
      (row) =>
        !!(
          !row?.signups.some((s) => s.name === "E2E Doomed") &&
          row?.signups.some((s) => s.name === "E2E Survivor" && s.status === "current")
        ),
    );
    expect(afterRemove.signups.some((s) => s.name === "E2E Survivor")).toBe(true);
  });
});
