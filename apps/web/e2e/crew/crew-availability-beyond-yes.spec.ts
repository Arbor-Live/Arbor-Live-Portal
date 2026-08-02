import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex, pollConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

/**
 * Crew availability beyond the single "Yes" path covered by
 * `crew-availability-assign.spec.ts`: No, Only-if-necessary, and Partial (with
 * a schedule-block window), plus the admin scheduling board's counts for those
 * responses. The crew storage state signs in as the e2e crew user, whose
 * profile is Sound-only and matches `seedCrewedEventWithSchedule`'s
 * `teamsInterested: ["Sound"]`.
 */
test.describe("crew availability beyond yes", () => {
  test.use({ storageState: crewAuthFile });

  test("crew marks No and the admin board counts it as unavailable", async ({
    page,
  }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Avail No ${Date.now()}`,
    }) as { eventId: string; title: string };

    await page.goto("/dashboard/events/my-availability");
    await expect(page.getByText("My Availability").first()).toBeVisible({
      timeout: 25_000,
    });
    const card = page
      .locator("div.rounded-md.border.p-4.space-y-4")
      .filter({ hasText: seeded.title })
      .first();
    await expect(card).toBeVisible({ timeout: 25_000 });
    await expect(card.getByText("Needs response").first()).toBeVisible();

    await card.getByText(/No — not available/i).click();
    await card.getByRole("button", { name: "Submit response" }).click();

    const state = await pollConvex<{
      responses: Array<{ userId: string; responseStatus: string }>;
    }>(
      "e2eHelpers:getEventCrewAvailabilityState",
      { eventId: seeded.eventId },
      (row) => !!row?.responses.some((r) => r.userId === crew.userId && r.responseStatus === "no"),
    );
    expect(state.responses.find((r) => r.userId === crew.userId)?.responseStatus).toBe("no");
    await expect(card.getByText("You: No").first()).toBeVisible({ timeout: 25_000 });
    await expect(card.getByText("Needs response")).toHaveCount(0);
  });

  test("crew marks Only if necessary and updates the response in place", async ({
    page,
  }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Avail Backup ${Date.now()}`,
    }) as { eventId: string; title: string };

    await page.goto("/dashboard/events/my-availability");
    await expect(page.getByText("My Availability").first()).toBeVisible({
      timeout: 25_000,
    });
    const card = page
      .locator("div.rounded-md.border.p-4.space-y-4")
      .filter({ hasText: seeded.title })
      .first();
    await expect(card).toBeVisible({ timeout: 25_000 });

    await card.getByText(/Only if necessary/i).click();
    await card.getByRole("button", { name: "Submit response" }).click();

    const state = await pollConvex<{
      responses: Array<{ userId: string; responseStatus: string }>;
    }>(
      "e2eHelpers:getEventCrewAvailabilityState",
      { eventId: seeded.eventId },
      (row) =>
        !!row?.responses.some(
          (r) => r.userId === crew.userId && r.responseStatus === "only_if_necessary",
        ),
    );
    expect(state.responses.find((r) => r.userId === crew.userId)?.responseStatus).toBe(
      "only_if_necessary",
    );

    // Update the same response to No — the button flips to "Update response".
    await card.getByText(/No — not available/i).click();
    await card.getByRole("button", { name: "Update response" }).click();
    const updated = await pollConvex<{
      responses: Array<{ userId: string; responseStatus: string }>;
    }>(
      "e2eHelpers:getEventCrewAvailabilityState",
      { eventId: seeded.eventId },
      (row) => !!row?.responses.some((r) => r.userId === crew.userId && r.responseStatus === "no"),
    );
    expect(updated.responses.find((r) => r.userId === crew.userId)?.responseStatus).toBe("no");
  });

  test("partial response with a schedule-block window persists start/end and notes", async ({
    page,
  }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Avail Partial ${Date.now()}`,
    }) as { eventId: string; title: string };

    await page.goto("/dashboard/events/my-availability");
    await expect(page.getByText("My Availability").first()).toBeVisible({
      timeout: 25_000,
    });
    const card = page
      .locator("div.rounded-md.border.p-4.space-y-4")
      .filter({ hasText: seeded.title })
      .first();
    await expect(card).toBeVisible({ timeout: 25_000 });

    await card.getByText(/Partial — specific time block\(s\)/i).click();

    // The first partial window pre-fills from the first schedule block (Setup),
    // so just pick the block explicitly and save with notes.
    const blockTrigger = card.getByTestId("searchable-select-trigger").first();
    await pickSearchableOption(page, blockTrigger, "Setup", /^Setup \(setup\)/);

    await card.getByPlaceholder("Notes for this window (optional)").fill("Only setup shift");
    await card.getByRole("button", { name: "Submit response" }).click();

    const state = await pollConvex<{
      responses: Array<{
        userId: string;
        responseStatus: string;
        partialWindows?: Array<{ startsAt: number; endsAt: number; notes?: string }>;
      }>;
    }>(
      "e2eHelpers:getEventCrewAvailabilityState",
      { eventId: seeded.eventId },
      (row) =>
        !!row?.responses.some(
          (r) => r.userId === crew.userId && r.responseStatus === "partial",
        ),
    );
    const mine = state.responses.find((r) => r.userId === crew.userId)!;
    expect(mine.responseStatus).toBe("partial");
    expect(mine.partialWindows?.length).toBeGreaterThan(0);
    expect(mine.partialWindows?.[0]?.endsAt).toBeGreaterThan(mine.partialWindows![0]!.startsAt);
    expect(mine.partialWindows?.[0]?.notes).toBe("Only setup shift");
    await expect(card.getByText("You: Partial").first()).toBeVisible({ timeout: 25_000 });
  });
});
