// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { calculateCrewCost } from "./lib/crewCost";
import { makeTest, type Test } from "./test/setup.helpers";

const H = 3_600_000;
const START = Date.UTC(2026, 9, 31, 22);

/** 2 on setup (2 hrs), 2 on the show (6 hrs), 3 on strike (2 hrs), all open at $20/hr. */
async function seedEvent(t: Test, otPremium: boolean) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("invoiceSettings", { key: "default", crewNormalRateUsd: 20, crewLeadRateUsd: 20, updatedAt: now });
    const eventId = await ctx.db.insert("events", {
      title: "Same people",
      status: "ready",
      visibility: "internal",
      startAt: START,
      endAt: START + 10 * H,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      otPremium,
      createdAt: now,
      updatedAt: now,
    });
    const sections: Array<["setup" | "show" | "strike", number, number, number]> = [
      ["setup", 0, 2, 2],
      ["show", 2, 8, 2],
      ["strike", 8, 10, 3],
    ];
    for (const [blockType, from, to, people] of sections) {
      const scheduleBlockId: Id<"eventScheduleBlocks"> = await ctx.db.insert("eventScheduleBlocks", {
        eventId,
        blockType,
        label: blockType,
        dayIndex: 0,
        startsAt: START + from * H,
        endsAt: START + to * H,
        createdAt: now,
        updatedAt: now,
      });
      for (let index = 0; index < people; index += 1) {
        await ctx.db.insert("eventCrewShifts", {
          eventId,
          scheduleBlockId,
          role: "Crew",
          startsAt: START + from * H,
          endsAt: START + to * H,
          hours: to - from,
          estimatedHourlyRateUsd: 20,
          postedToExpense: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return eventId;
  });
}

test("open slots are the same people all day, so hours past 8 bill at 1.5×", async () => {
  const t = makeTest();
  const eventId = await seedEvent(t, false);
  const cost = await t.run((ctx) => calculateCrewCost(ctx, eventId));
  // 2 people × (8 × $20 + 2 × $30) + 1 person × 2 × $20
  expect(cost.totalRegularHours).toBe(18);
  expect(cost.totalOvertimeHours).toBe(4);
  expect(cost.totalCostUsd).toBe(480);
});

test("an OT event bills 1.5× for the first 8 hrs and double time after", async () => {
  const t = makeTest();
  const eventId = await seedEvent(t, true);
  const cost = await t.run((ctx) => calculateCrewCost(ctx, eventId));
  // 2 people × (8 × $30 + 2 × $40) + 1 person × 2 × $30
  expect(cost.totalCostUsd).toBe(700);
  expect([cost.regularMultiplier, cost.overtimeMultiplier]).toEqual([1.5, 2]);
});
