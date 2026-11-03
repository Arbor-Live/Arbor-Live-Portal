// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { makeTest } from "../test/setup.helpers";
import { buildTimecardPeriodForUser } from "./userTimecards";

const H = 3_600_000;
const START = Date.UTC(2026, 9, 31, 2); // 7pm Pacific, Oct 30

test("time on two events at once is removed from the later shift, so the day counts it once", async () => {
  const t = makeTest();
  await t.run(async (ctx) => {
    const now = Date.now();
    for (const [title, from, to] of [["Event B", 0.75, 2], ["Event A", 0, 1]] as const) {
      const eventId = await ctx.db.insert("events", {
        title,
        status: "ready",
        visibility: "internal",
        startAt: START,
        endAt: START + 2 * H,
        timezone: "America/Los_Angeles",
        spansMultipleDays: false,
        setupOnly: false,
        strikeOnly: false,
        requiresShowWindow: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("eventCrewShifts", {
        eventId,
        role: "Crew",
        userId: "u1",
        startsAt: START + from * H,
        endsAt: START + to * H,
        hours: to - from,
        postedToExpense: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  const period = await t.run((ctx) =>
    buildTimecardPeriodForUser(ctx, "u1", { startMs: START - 24 * H, endMs: START + 24 * H, dueMs: START, label: "" }, START),
  );
  const day = period.days[0]!;
  // 7–8pm at A and 7:45–9pm at B: 2 hrs, not 2¼.
  expect(day.totalActual).toBe(2);
  expect(day.events.map((event) => [event.title, event.actualHours])).toEqual([
    ["Event A", 1],
    ["Event B", 1],
  ]);
});
