// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 1);
const END = START + 30 * DAY;

async function arborCrew(t: Test) {
  const crew = await createUser(t);
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, crew._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, crew._id, arbor.organizationId);
  return crew;
}

async function seedEvent(t: Test): Promise<Id<"events">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      title: "Open Mic",
      status: "ready",
      visibility: "public",
      startAt: START,
      endAt: START + 4 * 60 * 60 * 1000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      openMicEnabled: true,
      createdAt: START,
      updatedAt: START,
    }),
  );
}

async function seedSet(
  t: Test,
  eventId: Id<"events">,
  set: { email: string; name: string; performedAt?: number; status?: "performed" | "queued" },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("openMicSignups", {
      eventId,
      name: set.name,
      email: set.email,
      whatTheyreDoing: "Songs",
      equipment: [],
      status: set.status ?? "performed",
      skipsCount: 0,
      position: set.performedAt ?? START,
      performedAt: set.performedAt,
      submittedAt: START,
      createdAt: START,
      updatedAt: START,
    });
  });
}

test("counts only sets performed inside [startMs, endMs)", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);

  await seedSet(t, eventId, { email: "ana@stanford.edu", name: "Ana", performedAt: START - 1 });
  await seedSet(t, eventId, { email: "ana@stanford.edu", name: "Ana", performedAt: START });
  await seedSet(t, eventId, { email: "ana@stanford.edu", name: "Ana", performedAt: START + 5 * DAY });
  await seedSet(t, eventId, { email: "ana@stanford.edu", name: "Ana", performedAt: END });
  await seedSet(t, eventId, { email: "sam@stanford.edu", name: "Sam", performedAt: END - 1 });
  await seedSet(t, eventId, { email: "kim@stanford.edu", name: "Kim", performedAt: START + DAY });
  await seedSet(t, eventId, { email: "kim@stanford.edu", name: "Kim", status: "queued" });

  const result = await asUser(t, crew).query(api.openMic.getLeaderboard, { startMs: START, endMs: END });

  expect(result).toEqual({
    rows: [
      { email: "ana@stanford.edu", name: "Ana", count: 2, lastPerformedAt: START + 5 * DAY },
      { email: "sam@stanford.edu", name: "Sam", count: 1, lastPerformedAt: END - 1 },
      { email: "kim@stanford.edu", name: "Kim", count: 1, lastPerformedAt: START + DAY },
    ],
    performerCount: 3,
    truncated: false,
  });
});

test("returns nothing when no set falls in the range", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);
  await seedSet(t, eventId, { email: "ana@stanford.edu", name: "Ana", performedAt: END + DAY });

  const result = await asUser(t, crew).query(api.openMic.getLeaderboard, { startMs: START, endMs: END });

  expect(result).toEqual({ rows: [], performerCount: 0, truncated: false });
});

test.each([
  [2000, false],
  [2001, true],
])("with %i sets in range, truncated is %s", async (sets, truncated) => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);
  await t.run(async (ctx) => {
    for (let i = 0; i < sets; i += 1) {
      await ctx.db.insert("openMicSignups", {
        eventId,
        name: "Ana",
        email: "ana@stanford.edu",
        whatTheyreDoing: "Songs",
        equipment: [],
        status: "performed",
        skipsCount: 0,
        position: START + i,
        performedAt: START + i,
        submittedAt: START,
        createdAt: START,
        updatedAt: START,
      });
    }
  });

  const result = await asUser(t, crew).query(api.openMic.getLeaderboard, { startMs: START, endMs: END });

  expect(result.truncated).toBe(truncated);
  expect(result.performerCount).toBe(1);
  expect(result.rows[0]?.count).toBe(2000);
});

test("a cancelled event's Open Mic can't go live", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);
  await t.run(async (ctx) => ctx.db.patch(eventId, { status: "cancelled" }));

  await expect(
    asUser(t, crew).mutation(api.openMic.setOpenMicStatus, { eventId, status: "live" }),
  ).rejects.toThrow("This event is cancelled");
});

test("marking a night completed counts the set on stage and leaves the queue alone", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);
  const insert = (name: string, status: "current" | "queued") =>
    t.run(async (ctx) =>
      ctx.db.insert("openMicSignups", {
        eventId,
        name,
        email: `${name.toLowerCase()}@stanford.edu`,
        whatTheyreDoing: "Songs",
        equipment: [],
        status,
        skipsCount: 0,
        position: START,
        submittedAt: START,
        createdAt: START,
        updatedAt: START,
      }),
    );
  await insert("Ana", "current");
  const queuedId = await insert("Sam", "queued");

  const before = Date.now();
  await asUser(t, crew).mutation(api.openMic.setOpenMicStatus, { eventId, status: "completed" });
  const regulars = await asUser(t, crew).query(api.openMic.getLeaderboard, {
    startMs: before,
    endMs: Date.now() + 1,
  });

  expect(regulars.rows.map(({ email, count }) => ({ email, count }))).toEqual([
    { email: "ana@stanford.edu", count: 1 },
  ]);
  const { event, statuses } = await t.run(async (ctx) => ({
    event: await ctx.db.get(eventId),
    statuses: (await ctx.db.query("openMicSignups").collect()).map((signup) => signup.status).sort(),
  }));
  expect(event?.openMicStatus).toBe("completed");
  expect(statuses).toEqual(["performed", "queued"]);
  expect((await t.run(async (ctx) => ctx.db.get(queuedId)))?.status).toBe("queued");
});
