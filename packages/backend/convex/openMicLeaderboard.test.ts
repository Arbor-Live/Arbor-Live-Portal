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
    truncated: false,
  });
});

test("returns nothing when no set falls in the range", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);
  await seedSet(t, eventId, { email: "ana@stanford.edu", name: "Ana", performedAt: END + DAY });

  const result = await asUser(t, crew).query(api.openMic.getLeaderboard, { startMs: START, endMs: END });

  expect(result).toEqual({ rows: [], truncated: false });
});

test("marking a night completed counts the set on stage", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedEvent(t);
  const signupId = await t.run(async (ctx) =>
    ctx.db.insert("openMicSignups", {
      eventId,
      name: "Ana",
      email: "ana@stanford.edu",
      whatTheyreDoing: "Songs",
      equipment: [],
      status: "current",
      skipsCount: 0,
      position: START,
      submittedAt: START,
      createdAt: START,
      updatedAt: START,
    }),
  );

  await asUser(t, crew).mutation(api.openMic.setOpenMicStatus, { eventId, status: "completed" });

  const signup = await t.run(async (ctx) => ctx.db.get(signupId));
  expect(signup?.status).toBe("performed");
  expect(typeof signup?.performedAt).toBe("number");
});
