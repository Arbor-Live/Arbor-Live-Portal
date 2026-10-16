// @vitest-environment edge-runtime
import { addPacificCalendarDays, pacificDateAndTimeToMs, pacificDateKey } from "@arbor/format";
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
  setVerticals,
  type Test,
} from "./test/setup.helpers";

const NIGHT = pacificDateKey(addPacificCalendarDays(Date.now(), 5));
const at = (time: string) => pacificDateAndTimeToMs(NIGHT, time)!;

async function member(t: Test, arbor: { organizationId: string }, cartEligible = false) {
  const user = await createUser(t);
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      status: "active",
      verticals: ["Crew"],
      disciplines: ["Sound"],
      cartEligible,
      createdAt: now,
      updatedAt: now,
    });
  });
  return user;
}

/** Early setup → setup → show → strike, one slot each, everyone on `userId`. */
async function seedStaffedEvent(t: Test, userId: string, needsCart: boolean) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      title: "Cart night",
      status: "tentative",
      visibility: "internal",
      startAt: at("19:00"),
      endAt: at("22:00"),
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      needsCart,
      createdAt: now,
      updatedAt: now,
    });
    const sections = [
      { blockType: "setup" as const, label: "Early setup", from: "16:00", to: "17:00" },
      { blockType: "setup" as const, label: "Setup", from: "17:00", to: "19:00" },
      { blockType: "show" as const, label: "Show", from: "19:00", to: "22:00" },
      { blockType: "strike" as const, label: "Strike", from: "22:00", to: "23:00" },
    ];
    const blockIds: Record<string, Id<"eventScheduleBlocks">> = {};
    for (const section of sections) {
      const blockId = await ctx.db.insert("eventScheduleBlocks", {
        eventId,
        blockType: section.blockType,
        label: section.label,
        dayIndex: 0,
        startsAt: at(section.from),
        endsAt: at(section.to),
        createdAt: now,
        updatedAt: now,
      });
      blockIds[section.label] = blockId;
      await ctx.db.insert("eventCrewShifts", {
        eventId,
        scheduleBlockId: blockId,
        role: section.label,
        personName: "Crew",
        userId,
        startsAt: at(section.from),
        endsAt: at(section.to),
        hours: 1,
        postedToExpense: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { eventId, blockIds };
  });
}

async function addShift(
  t: Test,
  eventId: Id<"events">,
  blockId: Id<"eventScheduleBlocks">,
  shift: { userId?: string; crewApplicationId?: Id<"crewApplications"> },
) {
  await t.run(async (ctx) => {
    const block = (await ctx.db.get(blockId))!;
    const now = Date.now();
    await ctx.db.insert("eventCrewShifts", {
      eventId,
      scheduleBlockId: blockId,
      role: block.label,
      personName: "Extra",
      ...shift,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      hours: 1,
      postedToExpense: false,
      createdAt: now,
      updatedAt: now,
    });
  });
}

const range = () => ({ rangeStart: at("00:00"), rangeEnd: at("23:59") });

async function overviewRow(t: Test, staff: Parameters<typeof asUser>[1], eventId: Id<"events">) {
  const rows = await asUser(t, staff).query(api.eventCrewAvailability.listForAdminOverview, {
    ...range(),
    unconfirmedOnly: false,
  });
  return rows.find((row) => row._id === eventId)!;
}

async function needsCrewBadge(t: Test, staff: Parameters<typeof asUser>[1]) {
  const badges = await asUser(t, staff).query(api.navBadges.getNavBadges, {
    now: Date.now(),
    ...range(),
    includeArborInternal: true,
    includeAdmin: false,
    includeBand: false,
    includeOperations: true,
    includeUnconfirmedCrew: true,
  });
  return badges.unconfirmedCrew;
}

test("a full crew on a non-cart event is fully staffed", async () => {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const staff = await member(t, arbor);
  await setVerticals(t, staff._id, ["Operations"]);
  const sam = await member(t, arbor);
  const { eventId } = await seedStaffedEvent(t, sam._id, false);

  const row = await overviewRow(t, staff, eventId);
  expect(row).toMatchObject({ isCrewConfirmed: true, needsCart: false, cartUnmetGroups: [] });
  expect(await needsCrewBadge(t, staff)).toBe(0);
});

test("a cart event stays on needs-crew until setup and strike each have a cart person", async () => {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const staff = await member(t, arbor);
  await setVerticals(t, staff._id, ["Operations"]);
  const sam = await member(t, arbor);
  const maya = await member(t, arbor, true);
  const { eventId, blockIds } = await seedStaffedEvent(t, sam._id, true);

  let row = await overviewRow(t, staff, eventId);
  expect(row).toMatchObject({
    unfilledShifts: 0,
    isCrewConfirmed: false,
    cartRequirementMet: false,
    needsCart: true,
    cartUnmetGroups: ["setup", "strike"],
  });
  expect(await needsCrewBadge(t, staff)).toBe(1);
  const unconfirmed = await asUser(t, staff).query(api.eventCrewAvailability.listForAdminOverview, range());
  expect(unconfirmed.map((entry) => entry._id)).toContain(eventId);

  // A cart person on the show alone covers nothing.
  await addShift(t, eventId, blockIds["Show"]!, { userId: maya._id });
  expect((await overviewRow(t, staff, eventId)).cartUnmetGroups).toEqual(["setup", "strike"]);

  // Early setup covers the whole setup group.
  await addShift(t, eventId, blockIds["Early setup"]!, { userId: maya._id });
  expect((await overviewRow(t, staff, eventId)).cartUnmetGroups).toEqual(["strike"]);

  await addShift(t, eventId, blockIds["Strike"]!, { userId: maya._id });
  row = await overviewRow(t, staff, eventId);
  expect(row).toMatchObject({ isCrewConfirmed: true, cartRequirementMet: true, cartUnmetGroups: [] });
  expect(await needsCrewBadge(t, staff)).toBe(0);
  const summary = await asUser(t, staff).query(api.eventCrewAvailability.getSummaryForEvent, { eventId });
  expect(summary?.isCrewConfirmed).toBe(true);
});

test("staff can turn a cart event on and off with only that field", async () => {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const ops = await member(t, arbor);
  await setVerticals(t, ops._id, ["Operations"]);
  const sam = await member(t, arbor);
  const { eventId } = await seedStaffedEvent(t, sam._id, false);

  await asUser(t, ops).mutation(api.events.update, { id: eventId, needsCart: true });
  let event = await t.run(async (ctx) => await ctx.db.get(eventId));
  expect(event?.needsCart).toBe(true);
  expect(event?.title).toBe("Cart night");

  // Other edits leave it alone.
  await asUser(t, ops).mutation(api.events.update, { id: eventId, notes: "Load in from the loading dock" });
  event = await t.run(async (ctx) => await ctx.db.get(eventId));
  expect(event?.needsCart).toBe(true);

  await asUser(t, ops).mutation(api.events.update, { id: eventId, needsCart: false });
  event = await t.run(async (ctx) => await ctx.db.get(eventId));
  expect(event?.needsCart).toBe(false);

  await asUser(t, ops).mutation(api.events.update, { id: eventId, needsCart: true });
  const copyId = await asUser(t, ops).mutation(api.events.duplicate, { id: eventId });
  const copy = await t.run(async (ctx) => await ctx.db.get(copyId));
  expect(copy?.needsCart).toBe(true);
});
