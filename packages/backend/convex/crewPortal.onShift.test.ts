// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
  type TestUser,
} from "./test/setup.helpers";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 29, 18);

async function arborCrew(t: Test) {
  const crew = await createUser(t);
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, crew._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, crew._id, arbor.organizationId);
  return crew;
}

async function seedShift(
  t: Test,
  crew: TestUser,
  shift: { startsAt: number; endsAt: number },
  status: "ready" | "cancelled" = "ready",
) {
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      title: "Crew night",
      venueName: "Bing",
      status,
      visibility: "internal",
      startAt: shift.startsAt,
      endAt: shift.endsAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("eventCrewShifts", {
      eventId,
      role: "FOH",
      userId: crew._id,
      ...shift,
      hours: (shift.endsAt - shift.startsAt) / HOUR,
      postedToExpense: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return eventId;
  });
}

function myShifts(t: Test, crew: TestUser) {
  return asUser(t, crew).query(api.crewPortal.listMyActiveShifts, { now: NOW });
}

test("finds a shift already running", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const shift = { startsAt: NOW - 3 * HOUR, endsAt: NOW + HOUR };
  const eventId = await seedShift(t, crew, shift);
  expect(await myShifts(t, crew)).toEqual([
    { eventId, title: "Crew night", venueName: "Bing", ...shift, phase: "now" },
  ]);
});

test("finds a shift that ended 30 minutes ago", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const eventId = await seedShift(t, crew, { startsAt: NOW - 4 * HOUR, endsAt: NOW - HOUR / 2 });
  expect(await myShifts(t, crew)).toMatchObject([{ eventId, phase: "ended" }]);
});

test("leaves out a shift that ended two hours ago", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, { startsAt: NOW - 6 * HOUR, endsAt: NOW - 2 * HOUR });
  expect(await myShifts(t, crew)).toEqual([]);
});

test("leaves out another user's shift", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  const other = await createUser(t);
  await seedShift(t, other, { startsAt: NOW - HOUR, endsAt: NOW + HOUR });
  expect(await myShifts(t, crew)).toEqual([]);
});

test("leaves out a cancelled event", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, { startsAt: NOW - HOUR, endsAt: NOW + HOUR }, "cancelled");
  expect(await myShifts(t, crew)).toEqual([]);
});

test("rejects an unauthenticated caller", async () => {
  const t = makeTest();
  await expect(t.query(api.crewPortal.listMyActiveShifts, { now: NOW })).rejects.toThrow();
});
