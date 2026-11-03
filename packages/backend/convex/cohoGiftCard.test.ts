// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

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
  shift: { startsAt: number; endsAt: number; callTime?: number },
) {
  await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      title: "Crew night",
      status: "ready",
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
    await ctx.db.insert("cohoGiftCards", {
      label: "CoHo main",
      secureToken: "token",
      cardNumber: "6001234567890",
      balanceUsd: 100,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

async function myCard(t: Test, crew: TestUser) {
  return await asUser(t, crew).query(api.cohoGiftCard.getMyCohoGiftCard, { refreshTick: NOW });
}

test("shows the card two hours before a shift starts", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, { startsAt: NOW + 2 * HOUR, endsAt: NOW + 6 * HOUR });
  expect(await myCard(t, crew)).toEqual({ cardNumber: "6001234567890" });
});

test("hides the card earlier than two hours before a shift", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, { startsAt: NOW + 3 * HOUR, endsAt: NOW + 6 * HOUR });
  expect(await myCard(t, crew)).toBeNull();
});

test("opens from an earlier call time", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, {
    callTime: NOW + 2 * HOUR,
    startsAt: NOW + 3 * HOUR,
    endsAt: NOW + 6 * HOUR,
  });
  expect(await myCard(t, crew)).toEqual({ cardNumber: "6001234567890" });
});

test("keeps the card for two hours after a shift ends", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, { startsAt: NOW - 6 * HOUR, endsAt: NOW - 2 * HOUR });
  expect(await myCard(t, crew)).toEqual({ cardNumber: "6001234567890" });
});

test("hides the card more than two hours after a shift ends", async () => {
  const t = makeTest();
  const crew = await arborCrew(t);
  await seedShift(t, crew, { startsAt: NOW - 6 * HOUR, endsAt: NOW - 3 * HOUR });
  expect(await myCard(t, crew)).toBeNull();
});
