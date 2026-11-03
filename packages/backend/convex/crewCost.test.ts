// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { calculateCrewCost, syncCrewCostAfterStatusChange, syncEventCrewCostUsd } from "./lib/crewCost";
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

/** One person (`u1`, $20/hr) on a shift from hour `from` to `to` after START, on its own event. */
async function seedPersonEvent(
  t: Test,
  title: string,
  shifts: Array<[number, number]>,
  status: "ready" | "cancelled" = "ready",
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const existingRate = await ctx.db
      .query("userCompensationRates")
      .withIndex("by_userId", (q) => q.eq("userId", "u1"))
      .take(1);
    if (existingRate.length === 0) {
      await ctx.db.insert("userCompensationRates", { userId: "u1", rateMode: "custom", hourlyRateUsd: 20, createdAt: now, updatedAt: now });
    }
    const eventId = await ctx.db.insert("events", {
      title,
      status,
      visibility: "internal",
      startAt: START,
      endAt: START + 4 * H,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: now,
      updatedAt: now,
    });
    for (const [from, to] of shifts) {
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
    return eventId;
  });
}

test("a person's time on two events at once counts once, on the shift that starts first", async () => {
  const t = makeTest();
  // Event B is booked first, but A's 7–8pm starts before B's 7:45–9pm.
  const eventB = await seedPersonEvent(t, "B", [[1.75, 3]]);
  const eventA = await seedPersonEvent(t, "A", [[1, 2]]);
  const costA = await t.run((ctx) => calculateCrewCost(ctx, eventA));
  const costB = await t.run((ctx) => calculateCrewCost(ctx, eventB));
  expect(costA.totalRegularHours).toBe(1);
  expect(costB.totalRegularHours).toBe(1);
  expect(costB.totalCostUsd).toBe(20);
  expect(costB.byScheduleBlock[0]?.rows[0]).toMatchObject({ totalHours: 1, coveredHours: 0.25 });
});

test("overlapping shifts on one event count once", async () => {
  const t = makeTest();
  const eventId = await seedPersonEvent(t, "A", [[0, 2], [1, 3]]);
  const cost = await t.run((ctx) => calculateCrewCost(ctx, eventId));
  expect(cost.totalRegularHours).toBe(3);
});

test("a cancelled event's shift never covers another event's time", async () => {
  const t = makeTest();
  await seedPersonEvent(t, "A", [[1, 2]], "cancelled");
  const eventB = await seedPersonEvent(t, "B", [[1.75, 3]]);
  const cost = await t.run((ctx) => calculateCrewCost(ctx, eventB));
  expect(cost.totalRegularHours).toBe(1.25);
});

test("syncing one event re-prices the event it shares time with", async () => {
  const t = makeTest();
  const eventB = await seedPersonEvent(t, "B", [[1.75, 3]]);
  await t.run((ctx) => ctx.db.patch(eventB, { crewCostUsd: 25 }));
  const eventA = await seedPersonEvent(t, "A", [[1, 2]]);
  await t.run((ctx) => syncEventCrewCostUsd(ctx, eventA, Date.now()));
  const [a, b] = await t.run(async (ctx) => [await ctx.db.get(eventA), await ctx.db.get(eventB)]);
  expect(a?.crewCostUsd).toBe(20);
  expect(b?.crewCostUsd).toBe(20);
});

test("cancelling an event re-prices the event it shared time with", async () => {
  const t = makeTest();
  const eventA = await seedPersonEvent(t, "A", [[1, 2]]);
  const eventB = await seedPersonEvent(t, "B", [[1.75, 3]]);
  await t.run((ctx) => syncEventCrewCostUsd(ctx, eventB, Date.now()));
  expect((await t.run((ctx) => ctx.db.get(eventB)))?.crewCostUsd).toBe(20);
  await t.run(async (ctx) => {
    await ctx.db.patch(eventA, { status: "cancelled" });
    await syncCrewCostAfterStatusChange(ctx, eventA, "confirmed", "cancelled", Date.now());
  });
  expect((await t.run((ctx) => ctx.db.get(eventB)))?.crewCostUsd).toBe(25);
});
