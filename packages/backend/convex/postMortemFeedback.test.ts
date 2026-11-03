// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { makeTest, type Test } from "./test/setup.helpers";

const HOUR = 3_600_000;

async function seedForm(t: Test, token: string) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      title: "Test Post-mortem Event",
      status: "completed",
      visibility: "internal",
      startAt: now - 3 * HOUR,
      endAt: now - 2 * HOUR,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: "Test Post-mortem Venue",
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });
    const rowId = await ctx.db.insert("postMortemFeedback", {
      eventId,
      userId: "test-lead",
      token,
      createdAt: now,
    });
    return { eventId, rowId };
  });
}

test("stores the peak turnout submitted from the emailed form", async () => {
  const t = makeTest();
  const { rowId } = await seedForm(t, "pm_peak_turnout");

  await t.mutation(api.postMortemFeedback.submitByToken, {
    token: "pm_peak_turnout",
    rating: 4,
    peakTurnout: 120,
    whatWentWell: "Quick load-in.",
    whatCouldImprove: "Bring more gaff tape.",
  });

  const row = await t.run(async (ctx) => ctx.db.get(rowId));
  expect(row?.peakTurnout).toBe(120);
  expect(row?.rating).toBe(4);
  expect(row?.submittedAt).toEqual(expect.any(Number));
});

test("rejects a negative peak turnout", async () => {
  const t = makeTest();
  await seedForm(t, "pm_negative");

  await expect(
    t.mutation(api.postMortemFeedback.submitByToken, {
      token: "pm_negative",
      rating: 4,
      peakTurnout: -1,
      whatWentWell: "Quick load-in.",
      whatCouldImprove: "Bring more gaff tape.",
    }),
  ).rejects.toThrow("Peak turnout must be a whole number from 0 to 100,000.");
});

test("rejects a fractional peak turnout", async () => {
  const t = makeTest();
  await seedForm(t, "pm_fractional");

  await expect(
    t.mutation(api.postMortemFeedback.submitByToken, {
      token: "pm_fractional",
      rating: 4,
      peakTurnout: 12.5,
      whatWentWell: "Quick load-in.",
      whatCouldImprove: "Bring more gaff tape.",
    }),
  ).rejects.toThrow("Peak turnout must be a whole number from 0 to 100,000.");
});

test("rejects a peak turnout over 100,000", async () => {
  const t = makeTest();
  await seedForm(t, "pm_over_limit");

  await expect(
    t.mutation(api.postMortemFeedback.submitByToken, {
      token: "pm_over_limit",
      rating: 4,
      peakTurnout: 100_001,
      whatWentWell: "Quick load-in.",
      whatCouldImprove: "Bring more gaff tape.",
    }),
  ).rejects.toThrow("Peak turnout must be a whole number from 0 to 100,000.");
});

test.each([0, 100_000])("accepts a peak turnout of %s", async (peakTurnout) => {
  const t = makeTest();
  const { rowId } = await seedForm(t, `pm_boundary_${peakTurnout}`);

  await t.mutation(api.postMortemFeedback.submitByToken, {
    token: `pm_boundary_${peakTurnout}`,
    rating: 4,
    peakTurnout,
    whatWentWell: "Quick load-in.",
    whatCouldImprove: "Bring more gaff tape.",
  });

  const row = await t.run(async (ctx) => ctx.db.get(rowId));
  expect(row?.peakTurnout).toBe(peakTurnout);
});
