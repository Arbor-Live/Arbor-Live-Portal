// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildPublicBookingDayLoad } from "./lib/bookingDayLoad";
import { HASHING_DEFAULTS } from "./lib/hashing";
import { buildThisWeekAtArbor } from "./lib/newsletterWeek";
import { loadPublicCalendarEvents } from "./publicCalendar";
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

/** Sunday of week 6 of Autumn 2026. Tuesdays run Nov 3 through Dec 8. */
const NOW = new Date("2026-11-01T20:00:00Z").getTime();
const HOUR = 3_600_000;
const QUARTER = "2026-27-autumn";
const SETUP = { ...HASHING_DEFAULTS };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function member(
  t: Test,
  arbor: { organizationId: string },
  opts: { verticals?: ("Crew" | "Operations")[]; includeInTimecards?: boolean; name?: string } = {},
) {
  const user = await createUser(t, opts.name ? { name: opts.name } : {});
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      status: "active",
      verticals: opts.verticals ?? ["Crew"],
      disciplines: ["Sound"],
      includeInTimecards: opts.includeInTimecards,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("userCompensationRates", { userId: user._id, hourlyRateUsd: 20, createdAt: NOW, updatedAt: NOW });
  });
  return user;
}

async function setup() {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const ops = await member(t, arbor, { verticals: ["Operations"], name: "Olive Ops", includeInTimecards: false });
  const ana = await member(t, arbor, { name: "Ana Crew" });
  const ben = await member(t, arbor, { name: "Ben Crew" });
  const opsApi = asUser(t, ops);
  await opsApi.mutation(api.hashingSchedule.saveSetup, SETUP);
  const dates = await t.run(async (ctx) =>
    ctx.db
      .query("hashDates")
      .withIndex("by_quarterId_and_dateKey", (q) => q.eq("quarterId", QUARTER))
      .collect(),
  );
  const on = (dateKey: string) => {
    const row = dates.find((candidate) => candidate.dateKey === dateKey);
    if (!row) throw new Error(`no date ${dateKey}`);
    return row;
  };
  const eventOf = (dateKey: string) => {
    const eventId = on(dateKey).eventId;
    if (!eventId) throw new Error(`no event on ${dateKey}`);
    return eventId;
  };
  return { t, arbor, ops, ana, ben, opsApi, anaApi: asUser(t, ana), benApi: asUser(t, ben), dates, on, eventOf };
}

type Context = Awaited<ReturnType<typeof setup>>;

function shiftsOf(t: Test, eventId: Id<"events">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  );
}

function blocksOf(t: Test, eventId: Id<"events">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  );
}

async function getRow(t: Test, id: Id<"hashDates">) {
  return await t.run(async (ctx) => ctx.db.get(id));
}

async function getEvent(t: Test, id: Id<"events">) {
  return await t.run(async (ctx) => ctx.db.get(id));
}

function emailsTo(t: Test, user: TestUser) {
  return t.run(async (ctx) => (await ctx.db.query("emailNotifications").collect()).filter((row) => row.to === user.email.toLowerCase()));
}

async function markEmailsSent(t: Test) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("emailNotifications").collect()) {
      await ctx.db.patch(row._id, { status: "sent", sentAt: Date.now() });
    }
  });
}

async function bookAndRun(context: Context, dateKey: string, people: TestUser[]) {
  const hashDateId = context.on(dateKey)._id;
  for (const person of people) {
    await context.opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: person._id });
  }
  await context.opsApi.mutation(api.hashingLive.start, { hashDateId });
  return hashDateId;
}

function insertApplication(t: Test) {
  return t.run(async (ctx) =>
    ctx.db.insert("crewApplications", {
      status: "trainee",
      name: "Trey Trainee",
      email: "trey@arbor.test",
      phone: "6505550100",
      heardAboutUs: "friend",
      vertical: "Crew",
      discipline: "Sound",
      stanfordPosition: "undergrad",
      submittedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

function insertInvoice(t: Test) {
  return t.run(async (ctx) =>
    ctx.db.insert("invoices", {
      invoiceNumber: "ALINV-HASH",
      status: "draft",
      issueDate: "2026-10-01",
      managerUserId: "manager",
      managerName: "Alex Manager",
      equipmentPricingMode: "subsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 0,
      externalRentalsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 0,
      totalUsd: 0,
      clientApprovalStatus: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

function insertPlainEvent(t: Test, fields: Partial<{ startAt: number; endAt: number; visibility: "public" | "internal"; eventType: string }> = {}) {
  return t.run(async (ctx) =>
    ctx.db.insert("events", {
      title: "Crew social",
      status: "ready",
      visibility: "internal",
      startAt: NOW + 48 * HOUR,
      endAt: NOW + 50 * HOUR,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      eventType: "Crewed Event",
      createdAt: NOW,
      updatedAt: NOW,
      ...fields,
    }),
  );
}

describe("the event behind a hash", () => {
  test("setup makes one internal event with one section per live date, and off weeks have none", async () => {
    const { t, on, eventOf } = await setup();
    expect(on("2026-11-24")).toMatchObject({ status: "off" });
    expect(on("2026-11-24").eventId).toBeUndefined();

    const event = await getEvent(t, eventOf("2026-11-03"));
    expect(event).toMatchObject({
      title: "Hash",
      visibility: "internal",
      eventType: "Services Only",
      hashingEnabled: true,
      venueName: "The closet",
      startAt: on("2026-11-03").startsAt,
      endAt: on("2026-11-03").endsAt,
    });
    expect(event?.invoiceId).toBeUndefined();
    expect(await blocksOf(t, eventOf("2026-11-03"))).toMatchObject([{ blockType: "custom", label: "Cleaning" }]);
  });

  test("a booking is a real shift, costed like any other", async () => {
    const { t, opsApi, ana, on, eventOf } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("invoiceSettings", { key: "default", crewNormalRateUsd: 20, crewLeadRateUsd: 20, updatedAt: NOW });
    });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-17")._id, userId: ana._id });
    const eventId = eventOf("2026-11-17");
    const [block] = await blocksOf(t, eventId);
    expect(await shiftsOf(t, eventId)).toMatchObject([
      {
        role: "Hash",
        userId: ana._id,
        hours: 1,
        estimatedHourlyRateUsd: 20,
        scheduleBlockId: block?._id,
        startsAt: on("2026-11-17").startsAt,
        postedToExpense: false,
      },
    ]);
    expect((await getEvent(t, eventId))?.crewCostUsd).toBe(20);
  });

  test("moving mirrors onto the event, section and shifts, and asks for confirmation", async () => {
    const { t, opsApi, ana, on, eventOf } = await setup();
    const hashDateId = on("2026-11-17")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.moveDate, { hashDateId, dateKey: "2026-11-19", startTime: "12:00" });

    const row = await getRow(t, hashDateId);
    const eventId = eventOf("2026-11-17");
    expect(await getEvent(t, eventId)).toMatchObject({ startAt: row?.startsAt, endAt: row?.endsAt });
    expect(await blocksOf(t, eventId)).toMatchObject([{ startsAt: row?.startsAt, endsAt: row?.endsAt }]);
    expect(await shiftsOf(t, eventId)).toMatchObject([
      { startsAt: row?.startsAt, endsAt: row?.endsAt, hours: 1, needsConfirmation: true },
    ]);
  });

  test("switching a week on makes its event; off cancels it and on revives the same one", async () => {
    const { t, opsApi, ana, on, eventOf } = await setup();
    const offWeek = on("2026-11-24")._id;
    await opsApi.mutation(api.hashingSchedule.setDateOff, { hashDateId: offWeek, off: false });
    const created = (await getRow(t, offWeek))?.eventId;
    expect(await getEvent(t, created!)).toMatchObject({ visibility: "internal", hashingEnabled: true });

    const hashDateId = on("2026-11-17")._id;
    const eventId = eventOf("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.setDateOff, { hashDateId, off: true });
    expect(await shiftsOf(t, eventId)).toEqual([]);
    expect((await getEvent(t, eventId))?.status).toBe("cancelled");

    await opsApi.mutation(api.hashingSchedule.setDateOff, { hashDateId, off: false });
    expect((await getEvent(t, eventId))?.status).toBe("scheduling");
    expect((await getRow(t, hashDateId))?.eventId).toBe(eventId);
  });

  test("removing an added date deletes its event outright, and the removal notice still goes", async () => {
    const { t, opsApi, ana } = await setup();
    const hashDateId = await opsApi.mutation(api.hashingSchedule.addDate, {
      quarterId: QUARTER,
      dateKey: "2026-11-06",
      startTime: "11:00",
      capacity: 2,
      bookUserIds: [ana._id],
    });
    const eventId = (await getRow(t, hashDateId))?.eventId;
    await markEmailsSent(t);
    await opsApi.mutation(api.hashingSchedule.removeDate, { hashDateId });

    expect(await getRow(t, hashDateId)).toBeNull();
    expect(await getEvent(t, eventId!)).toBeNull();
    expect(await blocksOf(t, eventId!)).toEqual([]);
    expect(await shiftsOf(t, eventId!)).toEqual([]);
    const [notice] = (await emailsTo(t, ana)).filter((row) => row.template === "crew_unscheduled");
    expect(notice).toMatchObject({ status: "queued" });
    expect(notice?.eventId).toBeUndefined();
  });

  test("deleting a hash event takes its sidecar, answers, checks and claims with it", async () => {
    const context = await setup();
    const { t, anaApi, ana, on, eventOf, arbor } = context;
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: on("2026-11-10")._id, answer: "can" });
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
    await anaApi.mutation(api.hashingLive.setCheck, {
      hashDateId,
      itemKey: "large-packout:event-kit:event-kit-1",
      done: true,
    });
    await anaApi.mutation(api.hashingLive.setAreaClaim, { hashDateId, areaId: "large-packout", claimed: true });

    const admin = await createUser(t, { role: "admin" });
    await addMembership(t, admin._id, arbor.organizationId, "admin", true);
    await setActiveOrg(t, admin._id, arbor.organizationId);
    await t.run(async (ctx) => {
      await ctx.db.patch(eventOf("2026-11-03"), { status: "cancelled" });
    });
    await asUser(t, admin).mutation(api.events.deleteEvent, { id: eventOf("2026-11-03") });

    expect(await getRow(t, hashDateId)).toBeNull();
    const left = await t.run(async (ctx) => ({
      checks: await ctx.db.query("hashChecks").collect(),
      claims: await ctx.db.query("hashAreaClaims").collect(),
      answers: await ctx.db.query("hashAvailability").collect(),
    }));
    expect(left.checks).toEqual([]);
    expect(left.claims).toEqual([]);
    expect(left.answers.map((row) => row.hashDateId)).toEqual([on("2026-11-10")._id]);
  });
});

describe("one writer", () => {
  test("a Hashing-made hash takes its location from Setup, and an add-on keeps its own venue", async () => {
    const context = await setup();
    const { t, opsApi, on, eventOf } = context;
    const venueId = await t.run(async (ctx) => ctx.db.insert("venues", { name: "Bing", path: "Bing", kind: "indoor", venueType: "Hall", createdAt: NOW, updatedAt: NOW }));
    await expect(opsApi.mutation(api.events.update, { id: eventOf("2026-11-17"), venueId })).rejects.toThrow(/location comes from Hashing/);
    await expect(opsApi.mutation(api.events.update, { id: eventOf("2026-11-17"), venueId: null })).rejects.toThrow(/location comes from Hashing/);

    const addon = await insertPlainEvent(t);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId: addon, enabled: true });
    await opsApi.mutation(api.events.update, { id: addon, venueId });
    expect((await getEvent(t, addon))?.venueId).toBe(venueId);

    const hashDateId = on("2026-11-17")._id;
    await opsApi.mutation(api.hashingSchedule.moveDate, { hashDateId, dateKey: "2026-11-19", startTime: "12:00" });
    const added = await opsApi.mutation(api.hashingSchedule.addDate, { quarterId: QUARTER, dateKey: "2026-11-06", startTime: "11:00", capacity: 2 });
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, location: "The attic" });

    expect((await getEvent(t, eventOf("2026-11-17")))?.venueName).toBe("The attic");
    expect((await getEvent(t, (await getRow(t, added))!.eventId!))?.venueName).toBe("The attic");
    expect((await getEvent(t, eventOf("2026-11-10")))?.venueName).toBe("The attic");
    expect((await getEvent(t, addon))?.venueName).toBe("Bing");
  });

  test("a hash that has started keeps the location it ran at", async () => {
    const context = await setup();
    const { t, opsApi, ana, eventOf } = context;
    await bookAndRun(context, "2026-11-03", [ana]);
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, location: "The attic" });
    expect((await getEvent(t, eventOf("2026-11-03")))?.venueName).toBe("The closet");
  });

  test("the event mutations refuse a hash's times, status, visibility and invoice", async () => {
    const { t, opsApi, on, eventOf } = await setup();
    const id = eventOf("2026-11-17");
    const hashing = /Change them there/;
    await expect(opsApi.mutation(api.events.update, { id, startAt: on("2026-11-17").startsAt + HOUR })).rejects.toThrow(hashing);
    await expect(opsApi.mutation(api.events.update, { id, endAt: on("2026-11-17").endsAt + HOUR })).rejects.toThrow(hashing);
    await expect(opsApi.mutation(api.events.update, { id, status: "cancelled" })).rejects.toThrow(hashing);
    await expect(opsApi.mutation(api.events.setStatus, { id, status: "cancelled" })).rejects.toThrow(hashing);
    await expect(opsApi.mutation(api.events.update, { id, visibility: "public" })).rejects.toThrow(/stays internal/);
    await expect(opsApi.mutation(api.events.update, { id, openMicEnabled: true })).rejects.toThrow(/public sign-ups/);
    await expect(opsApi.mutation(api.events.duplicate, { id })).rejects.toThrow(/from Hashing/);

    await expect(opsApi.mutation(api.events.update, { id, invoiceId: await insertInvoice(t) })).rejects.toThrow(/can't have an invoice/);

    await opsApi.mutation(api.events.update, { id, title: "Closet deep clean", notes: "Bring gloves" });
    expect((await getEvent(t, id))?.title).toBe("Closet deep clean");
  });

  test("the schedule refuses a hash's blocks moving, going or being added", async () => {
    const { t, opsApi, eventOf } = await setup();
    const eventId = eventOf("2026-11-17");
    const [block] = await blocksOf(t, eventId);
    const saved = { id: block!._id, blockType: block!.blockType, label: "Sweep", startsAt: block!.startsAt, endsAt: block!.endsAt };
    await opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [saved] });
    expect((await blocksOf(t, eventId))[0]?.label).toBe("Sweep");

    const refused = /Change them there/;
    await expect(
      opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [{ ...saved, startsAt: saved.startsAt + HOUR, endsAt: saved.endsAt + HOUR }] }),
    ).rejects.toThrow(refused);
    await expect(opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [] })).rejects.toThrow(refused);
    await expect(
      opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [saved, { ...saved, id: undefined }] }),
    ).rejects.toThrow(refused);
  });

  test("a hash's section can't change type, and keeps its job under a new name", async () => {
    const { t, opsApi, ana, on, eventOf } = await setup();
    const hashDateId = on("2026-11-17")._id;
    const eventId = eventOf("2026-11-17");
    const [block] = await blocksOf(t, eventId);
    const saved = { id: block!._id, blockType: block!.blockType, label: "Sweep", startsAt: block!.startsAt, endsAt: block!.endsAt };
    await expect(
      opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [{ ...saved, blockType: "show" }] }),
    ).rejects.toThrow(/Change them there/);

    await opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [saved] });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    expect(await blocksOf(t, eventId)).toHaveLength(1);
    expect((await shiftsOf(t, eventId))[0]?.scheduleBlockId).toBe(block!._id);

    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, durationMinutes: 90 });
    const row = await getRow(t, hashDateId);
    expect(row!.endsAt - row!.startsAt).toBe(1.5 * HOUR);
    expect(await blocksOf(t, eventId)).toMatchObject([{ label: "Sweep", startsAt: row!.startsAt, endsAt: row!.endsAt }]);
    expect(await shiftsOf(t, eventId)).toMatchObject([{ startsAt: row!.startsAt, endsAt: row!.endsAt, hours: 1.5 }]);
  });

  test("a move re-times every booking, even one with no section link", async () => {
    const { t, opsApi, ana, on, eventOf } = await setup();
    const hashDateId = on("2026-11-17")._id;
    const eventId = eventOf("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await t.run(async (ctx) => {
      const [shift] = await ctx.db.query("eventCrewShifts").collect();
      await ctx.db.patch(shift!._id, { scheduleBlockId: undefined });
    });
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, durationMinutes: 90 });
    const row = await getRow(t, hashDateId);
    expect(await shiftsOf(t, eventId)).toMatchObject([{ startsAt: row!.startsAt, endsAt: row!.endsAt, hours: 1.5 }]);
  });

  test("a crew edit on the event page counts as a booking, and can't move the shift", async () => {
    const { t, opsApi, anaApi, ana, on, eventOf } = await setup();
    const row = on("2026-11-17");
    const eventId = eventOf("2026-11-17");
    const [block] = await blocksOf(t, eventId);
    const shift = {
      scheduleBlockId: block!._id,
      role: "Cleaner",
      userId: ana._id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      postedToExpense: false,
    };
    await opsApi.mutation(api.eventCrew.upsertShifts, { eventId, shifts: [shift] });
    expect(await shiftsOf(t, eventId)).toMatchObject([{ role: "Hash", userId: ana._id, scheduleBlockId: block!._id }]);
    const mine = await anaApi.query(api.hashing.getMine, { now: NOW });
    expect(mine?.state).toBe("booked");
    expect(mine?.dates.find((date) => date._id === row._id)?.booking).toBe("booked");

    await expect(
      opsApi.mutation(api.eventCrew.upsertShifts, { eventId, shifts: [{ ...shift, startsAt: row.startsAt + HOUR, endsAt: row.endsAt + HOUR }] }),
    ).rejects.toThrow(/Change them there/);
    await expect(
      opsApi.mutation(api.eventCrew.upsertShifts, {
        eventId,
        shifts: [{ ...shift, crewApplicationId: await insertApplication(t) }],
      }),
    ).rejects.toThrow(/doesn't take trainees/);
  });

  function crewEdit(context: Context, dateKey: string) {
    const { opsApi, on, eventOf } = context;
    const row = on(dateKey);
    const eventId = eventOf(dateKey);
    const slot = (userId?: string) => ({ role: "Hash", userId, startsAt: row.startsAt, endsAt: row.endsAt, postedToExpense: false });
    return {
      eventId,
      slot,
      save: (...userIds: (string | undefined)[]) =>
        opsApi.mutation(api.eventCrew.upsertShifts, { eventId, shifts: userIds.map(slot) }),
    };
  }

  test("a crew edit obeys the booking rules for anyone new", async () => {
    const context = await setup();
    const { t, opsApi, arbor, ops, ana, ben, on } = context;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-10")._id, userId: ana._id });
    const edit = crewEdit(context, "2026-11-17");

    await expect(edit.save(ops._id)).rejects.toThrow(/Only active crew/);
    await expect(edit.save(ana._id)).rejects.toThrow(/They're already on/);
    await expect(edit.save(undefined)).rejects.toThrow(/can't have an open slot/);
    await expect(edit.save(ben._id, ben._id)).rejects.toThrow(/on this hash twice/);

    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, spotsPerHash: 1 });
    const carol = await member(t, arbor, { name: "Carol Crew" });
    await edit.save(ben._id);
    await expect(edit.save(ben._id, carol._id)).rejects.toThrow(/is full \(1 of 1\)/);
    await edit.save(carol._id);
    expect(await shiftsOf(t, edit.eventId)).toMatchObject([{ userId: carol._id }]);
  });

  test("a crew edit keeps anyone already on the hash, even past a lowered capacity", async () => {
    const context = await setup();
    const { t, opsApi, ana, ben, on } = context;
    const hashDateId = on("2026-11-17")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ben._id });
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, spotsPerHash: 1 });
    const edit = crewEdit(context, "2026-11-17");
    await edit.save(ana._id, ben._id);
    expect(await shiftsOf(t, edit.eventId)).toHaveLength(2);
  });

  test("on a finished hash an unchanged crew save passes, and a real change is refused", async () => {
    const context = await setup();
    const { t, opsApi, ana, ben } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
    await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
    const edit = crewEdit(context, "2026-11-03");
    const [shift] = await shiftsOf(t, edit.eventId);
    const kept = { id: shift!._id, scheduleBlockId: shift!.scheduleBlockId, ...edit.slot(ana._id) };

    await opsApi.mutation(api.eventCrew.upsertShifts, { eventId: edit.eventId, shifts: [kept] });
    await expect(
      opsApi.mutation(api.eventCrew.upsertShifts, { eventId: edit.eventId, shifts: [{ ...kept, userId: ben._id }] }),
    ).rejects.toThrow(/hash is over/);
    await expect(opsApi.mutation(api.eventCrew.upsertShifts, { eventId: edit.eventId, shifts: [] })).rejects.toThrow(/hash is over/);
    expect(await shiftsOf(t, edit.eventId)).toMatchObject([{ userId: ana._id }]);
  });

  test("booked, off and finish count the same people however the shift got there", async () => {
    const context = await setup();
    const { t, opsApi, ana, ben } = context;
    const eventId = await insertPlainEvent(t);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    const row = await getRow(t, addon!.hashDateId);
    await opsApi.mutation(api.eventCrew.upsertShifts, {
      eventId,
      shifts: [ana, ben].map((person) => ({
        role: "Sweeper",
        userId: person._id,
        startsAt: row!.startsAt,
        endsAt: row!.endsAt,
        postedToExpense: false,
      })),
    });
    expect((await opsApi.query(api.hashing.getEventAddon, { eventId }))?.filled).toBe(2);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: false });
    expect(await shiftsOf(t, eventId)).toEqual([]);
  });

  test("handing a pending slot to someone else doesn't hand them the question", async () => {
    const { t, opsApi, ana, ben, on, eventOf } = await setup();
    const hashDateId = on("2026-11-17")._id;
    const eventId = eventOf("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.moveDate, { hashDateId, dateKey: "2026-11-19", startTime: "16:00" });
    const [shift] = await shiftsOf(t, eventId);
    await opsApi.mutation(api.eventCrew.upsertShifts, {
      eventId,
      shifts: [
        {
          id: shift!._id,
          scheduleBlockId: shift!.scheduleBlockId,
          role: shift!.role,
          userId: ben._id,
          startsAt: shift!.startsAt,
          endsAt: shift!.endsAt,
          postedToExpense: false,
        },
      ],
    });
    expect((await shiftsOf(t, eventId))[0]?.needsConfirmation).toBeUndefined();
  });
});

describe("pay and attendance", () => {
  async function timecardTitles(api_: ReturnType<typeof asUser>, now: number) {
    const periods = await api_.query(api.timecards.getMyTimecards, { now });
    return periods.flatMap((period) => period.days.flatMap((day) => day.events.map((event) => [event.title, event.actualHours])));
  }

  test("finish keeps the shift of who was there; the rest lose it and need a hash again", async () => {
    const context = await setup();
    const { t, opsApi, anaApi, benApi, ana, ben, eventOf } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana, ben]);
    await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });

    const eventId = eventOf("2026-11-03");
    expect((await shiftsOf(t, eventId)).map((shift) => shift.userId)).toEqual([ana._id]);
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("done");
    expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");
    expect((await getEvent(t, eventId))?.status).toBe("completed");
    expect((await getEvent(t, eventId))?.crewCostUsd).toBe(20);

    const after = new Date("2026-11-04T20:00:00Z").getTime();
    expect(await timecardTitles(anaApi, after)).toEqual([["Hash", 1]]);
    expect(await timecardTitles(benApi, after)).toEqual([]);
  });

  test("finish needs a name on the list, and crew have to be on it themselves", async () => {
    const context = await setup();
    const { opsApi, anaApi, ana, ben } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana, ben]);
    await expect(opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [] })).rejects.toThrow(/Tick who was there/);
    await expect(anaApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [] })).rejects.toThrow(/Tick who was there/);
    await expect(anaApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ben._id] })).rejects.toThrow(/tick yourself/);
    await anaApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id, ben._id] });
    expect(await getRow(context.t, hashDateId)).toMatchObject({ status: "finished" });
  });

  test("ops can close a hash with nobody booked", async () => {
    const context = await setup();
    const hashDateId = await bookAndRun(context, "2026-11-03", []);
    await context.opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [] });
    expect(await getRow(context.t, hashDateId)).toMatchObject({ status: "finished" });
  });

  describe("correcting attendance", () => {
    const AFTER = new Date("2026-11-05T12:00:00Z").getTime();

    test("on a finished hash it adds and removes people, with pay, cost and notices following", async () => {
      const context = await setup();
      const { t, opsApi, anaApi, benApi, ana, ben, eventOf } = context;
      const hashDateId = await bookAndRun(context, "2026-11-03", [ana, ben]);
      await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
      await markEmailsSent(t);
      const eventId = eventOf("2026-11-03");
      expect(await timecardTitles(benApi, AFTER)).toEqual([]);

      await opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [ben._id] });

      expect((await shiftsOf(t, eventId)).map((shift) => shift.userId)).toEqual([ben._id]);
      expect(await timecardTitles(benApi, AFTER)).toEqual([["Hash", 1]]);
      expect(await timecardTitles(anaApi, AFTER)).toEqual([]);
      expect((await getEvent(t, eventId))?.crewCostUsd).toBe(20);
      expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("done");
      expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");
      expect((await emailsTo(t, ana)).map((row) => row.template)).toContain("crew_unscheduled");
      const queued = (await emailsTo(t, ben)).filter((row) => row.status === "queued");
      expect(queued).toMatchObject([{ template: "crew_scheduled", subject: expect.stringMatching(/you're marked as there/) }]);
      expect(await getRow(t, hashDateId)).toMatchObject({ status: "finished" });
    });

    test("on a lapsed hash it revives the event, credits and pays who's named", async () => {
      const { t, opsApi, anaApi, ana, ben, on, eventOf } = await setup();
      const hashDateId = on("2026-11-03")._id;
      await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
      vi.setSystemTime(AFTER);
      await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
      const eventId = eventOf("2026-11-03");
      expect(await getEvent(t, eventId)).toMatchObject({ status: "cancelled", crewCostUsd: 0 });

      await expect(
        opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [] }),
      ).rejects.toThrow(/Name who was there/);
      await opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [ana._id, ben._id] });

      expect(await getRow(t, hashDateId)).toMatchObject({ status: "finished" });
      expect(await getEvent(t, eventId)).toMatchObject({ status: "completed", crewCostUsd: 40 });
      expect((await shiftsOf(t, eventId)).map((shift) => shift.userId).sort()).toEqual([ana._id, ben._id].sort());
      expect(await timecardTitles(anaApi, AFTER)).toEqual([["Hash", 1]]);
      expect((await anaApi.query(api.hashing.getMine, { now: AFTER }))?.state).toBe("done");
    });

    test("on a lapsed add-on it makes the event a hash again", async () => {
      const { t, opsApi, anaApi, ana } = await setup();
      const eventId = await insertPlainEvent(t);
      await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
      const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
      const hashDateId = addon!.hashDateId;
      vi.setSystemTime(AFTER);
      await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});

      await opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [ana._id] });
      const [block] = await blocksOf(t, eventId);
      expect(await getEvent(t, eventId)).toMatchObject({ status: "completed", hashingEnabled: true });
      expect(await shiftsOf(t, eventId)).toMatchObject([{ role: "Hash", userId: ana._id, scheduleBlockId: block?._id }]);
      expect(await timecardTitles(anaApi, AFTER)).toEqual([["Crew social", 2]]);
    });

    test("a lapsed add-on's event that moved on as a plain event can't be claimed back", async () => {
      const { t, opsApi, ana } = await setup();
      const eventId = await insertPlainEvent(t);
      await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
      const { hashDateId } = (await opsApi.query(api.hashing.getEventAddon, { eventId }))!;
      vi.setSystemTime(AFTER);
      await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
      const event = await getEvent(t, eventId);

      await opsApi.mutation(api.events.update, { id: eventId, endAt: event!.endAt + HOUR });
      await expect(opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [ana._id] })).rejects.toThrow(/has moved/);

      await opsApi.mutation(api.events.update, { id: eventId, endAt: event!.endAt });
      await t.run(async (ctx) => {
        await ctx.db.insert("eventCrewShifts", {
          eventId,
          role: "FOH",
          startsAt: event!.startAt,
          endsAt: event!.endAt,
          hours: 1,
          postedToExpense: false,
          createdAt: NOW,
          updatedAt: NOW,
        });
      });
      await expect(opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [ana._id] })).rejects.toThrow(/has crew/);
    });

    test("it holds to who can be credited, who can do it, and which hashes it reaches", async () => {
      const context = await setup();
      const { t, opsApi, anaApi, ops, ana, ben, on } = context;
      const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
      const correct = (userIds: string[]) => opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: userIds });
      await expect(correct([ana._id])).rejects.toThrow(/finished or lapsed/);
      await expect(opsApi.mutation(api.hashingLive.correctAttendance, { hashDateId: on("2026-11-10")._id, attendeeUserIds: [ana._id] })).rejects.toThrow(/finished or lapsed/);

      await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
      await expect(anaApi.mutation(api.hashingLive.correctAttendance, { hashDateId, attendeeUserIds: [ana._id] })).rejects.toThrow(/access/i);
      await expect(correct([ana._id, ops._id])).rejects.toThrow(/Only active crew/);
      await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-10")._id, userId: ben._id });
      await expect(correct([ana._id, ben._id])).rejects.toThrow(/They're already on/);
      await correct([]);
      expect(await shiftsOf(t, on("2026-11-03").eventId!)).toEqual([]);
      expect(await getRow(t, hashDateId)).toMatchObject({ status: "finished" });
    });

    test("the dialog gets everyone who could be credited, with the attendees marked", async () => {
      const context = await setup();
      const { opsApi, anaApi, ana } = context;
      const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
      await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
      await expect(anaApi.query(api.hashingLive.getAttendance, { hashDateId })).rejects.toThrow(/access/i);
      const attendance = await opsApi.query(api.hashingLive.getAttendance, { hashDateId });
      expect(attendance.attendeeIds).toEqual([ana._id]);
      expect(attendance.crew.map((person) => person.name)).toEqual(["Ana Crew", "Ben Crew"]);
    });

    test("History lists lapsed hashes beside finished ones", async () => {
      const { t, opsApi, on } = await setup();
      vi.setSystemTime(AFTER);
      await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
      expect((await opsApi.query(api.hashingLive.getHistory, {})).lapsed).toMatchObject([{ _id: on("2026-11-03")._id }]);
    });
  });

  test("a person never confirmed is credited only if ticked, and that settles it", async () => {
    const context = await setup();
    const { t, opsApi, anaApi, ana, ben, eventOf } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana, ben]);
    await t.run(async (ctx) => {
      for (const shift of await ctx.db.query("eventCrewShifts").collect()) {
        await ctx.db.patch(shift._id, { needsConfirmation: true });
      }
    });
    await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
    expect(await shiftsOf(t, eventOf("2026-11-03"))).toMatchObject([{ userId: ana._id }]);
    expect((await shiftsOf(t, eventOf("2026-11-03")))[0]?.needsConfirmation).toBeUndefined();
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("done");
  });

  test("finish is idempotent, refuses strangers, and leaves no way to credit someone after", async () => {
    const context = await setup();
    const { t, opsApi, benApi, ana, ben, on, eventOf } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
    await expect(
      opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ben._id] }),
    ).rejects.toThrow(/Only people booked/);

    await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
    await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [] });
    const eventId = eventOf("2026-11-03");
    expect(await shiftsOf(t, eventId)).toMatchObject([{ userId: ana._id }]);

    const row = on("2026-11-03");
    const [block] = await blocksOf(t, eventId);
    await expect(
      opsApi.mutation(api.eventCrew.upsertShifts, {
        eventId,
        shifts: [{ scheduleBlockId: block!._id, role: "Hash", userId: ben._id, startsAt: row.startsAt, endsAt: row.endsAt, postedToExpense: false }],
      }),
    ).rejects.toThrow(/hash is over/);
    await expect(benApi.mutation(api.hashing.confirmBooking, { hashDateId })).rejects.toThrow(/already finished/);
    await expect(opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ben._id })).rejects.toThrow(/can't take bookings/);
    expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");
  });

  test("the nightly close pays nobody for a hash nobody started, and can repeat", async () => {
    const { t, opsApi, anaApi, ana, on, eventOf } = await setup();
    const hashDateId = on("2026-11-03")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await t.run(async (ctx) => {
      await ctx.db.patch(eventOf("2026-11-03"), { crewCostUsd: 20 });
    });

    const later = new Date("2026-11-05T12:00:00Z").getTime();
    vi.setSystemTime(later);
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});

    const eventId = eventOf("2026-11-03");
    expect((await getRow(t, hashDateId))?.status).toBe("lapsed");
    expect(await shiftsOf(t, eventId)).toEqual([]);
    expect(await getEvent(t, eventId)).toMatchObject({ status: "cancelled", crewCostUsd: 0 });
    expect((await anaApi.query(api.hashing.getMine, { now: later }))?.state).toBe("needs_hash");
    expect(await timecardTitles(anaApi, later)).toEqual([]);
    expect((await getRow(t, on("2026-11-10")._id))?.status).toBe("scheduled");
  });

  test("the nightly close leaves a hash running and one that ran today", async () => {
    const context = await setup();
    const { t, ana } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z").getTime());
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
    expect((await getRow(t, hashDateId))?.status).toBe("in_progress");
  });

  test("the nightly close stops at a batch and carries on in a new transaction", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let index = 0; index < 26; index += 1) {
        const startsAt = NOW - (index + 2) * 24 * HOUR;
        const eventId = await ctx.db.insert("events", {
          title: "Hash",
          status: "scheduling",
          visibility: "internal",
          startAt: startsAt,
          endAt: startsAt + HOUR,
          timezone: "America/Los_Angeles",
          spansMultipleDays: false,
          setupOnly: false,
          strikeOnly: false,
          requiresShowWindow: false,
          hashingEnabled: true,
          createdAt: NOW,
          updatedAt: NOW,
        });
        const sectionBlockId = await ctx.db.insert("eventScheduleBlocks", {
          eventId,
          blockType: "custom",
          label: "Cleaning",
          dayIndex: 0,
          startsAt,
          endsAt: startsAt + HOUR,
          createdAt: NOW,
          updatedAt: NOW,
        });
        await ctx.db.insert("hashDates", {
          quarterId: QUARTER,
          dateKey: "2026-10-01",
          startsAt,
          endsAt: startsAt + HOUR,
          capacity: 3,
          origin: "added",
          status: "scheduled",
          eventId,
          sectionBlockId,
        });
      }
    });
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
    const statuses = await t.run(async (ctx) => (await ctx.db.query("hashDates").collect()).map((row) => row.status));
    expect(statuses.filter((status) => status === "lapsed")).toHaveLength(25);
    const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((job) => job.name.includes("closeLapsedHashes"))).toBe(true);
  });
});

describe("stale running hashes", () => {
  test("a hash a day past its end shows on the overview for ops, and nothing finishes it", async () => {
    const context = await setup();
    const { t, opsApi, anaApi, ana, on } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
    const row = on("2026-11-03");

    const within = row.endsAt + 24 * HOUR - 1;
    expect((await opsApi.query(api.hashing.getOverview, { now: within })).staleHashes).toEqual([]);

    const past = row.endsAt + 24 * HOUR + 1;
    expect((await opsApi.query(api.hashing.getOverview, { now: past })).staleHashes).toEqual([
      { _id: hashDateId, dateKey: "2026-11-03", startsAt: row.startsAt },
    ]);
    expect((await anaApi.query(api.hashing.getOverview, { now: past })).staleHashes).toEqual([]);

    vi.setSystemTime(past);
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
    expect((await getRow(t, hashDateId))?.status).toBe("in_progress");
  });
});

describe("notifications", () => {
  test("a booking queues the crew_scheduled invite, with a calendar file and a link to My hashes", async () => {
    const { t, opsApi, ana, on } = await setup();
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-17")._id, userId: ana._id });
    const [email] = await emailsTo(t, ana);
    expect(email).toMatchObject({ template: "crew_scheduled", status: "queued", subject: expect.stringContaining("Hash") });
    expect(email?.payload).toMatchObject({
      eventUrl: expect.stringMatching(/\/dashboard\/events\/hashing$/),
      icsEvent: { title: "Hash — Cleaning (Hash)", startAt: on("2026-11-17").startsAt, sequence: 1 },
    });
  });

  test("unbooking cancels a queued invite, and sends crew_unscheduled once one went out", async () => {
    const { t, opsApi, ana, on } = await setup();
    const hashDateId = on("2026-11-17")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.unbookPerson, { hashDateId, userId: ana._id });
    expect(await emailsTo(t, ana)).toEqual([]);

    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await markEmailsSent(t);
    await opsApi.mutation(api.hashingSchedule.unbookPerson, { hashDateId, userId: ana._id });
    expect((await emailsTo(t, ana)).map((row) => row.template).sort()).toEqual(["crew_scheduled", "crew_unscheduled"]);
  });

  test("a move re-sends the same invite, later in sequence, asking if they can still make it", async () => {
    const { t, opsApi, ana, on } = await setup();
    const hashDateId = on("2026-11-17")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await markEmailsSent(t);
    await opsApi.mutation(api.hashingSchedule.moveDate, { hashDateId, dateKey: "2026-11-19", startTime: "12:00" });
    const emails = (await emailsTo(t, ana)).sort((a, b) => a._creationTime - b._creationTime);
    expect(emails).toHaveLength(2);
    const [first, second] = emails.map((row) => (row.payload as { icsEvent: { uid: string; sequence: number } }).icsEvent);
    expect(second?.uid).toBe(first?.uid);
    expect(second!.sequence).toBeGreaterThan(first!.sequence);
    expect(emails[1]?.subject).toMatch(/^Hash moved: Thu, Nov 19.*Can you still make it\?$/);
  });

  test("fill sends each person exactly one invite, however many land on one date", async () => {
    const { t, opsApi, anaApi, benApi, ana, ben, on, eventOf } = await setup();
    const hashDateId = on("2026-11-17")._id;
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId, answer: "can" });
    await benApi.mutation(api.hashing.setAvailability, { hashDateId, answer: "can" });
    await opsApi.mutation(api.hashingSchedule.applyFill, {});
    expect(await emailsTo(t, ana)).toHaveLength(1);
    expect(await emailsTo(t, ben)).toHaveLength(1);
    expect(await shiftsOf(t, eventOf("2026-11-17"))).toHaveLength(2);
    expect((await getEvent(t, eventOf("2026-11-17")))?.crewInviteSequence).toBe(1);
  });

  test("preferences hold: the bell can be muted, and the invite itself is required mail", async () => {
    const { t, opsApi, ana, on } = await setup();
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", ana._id))
        .unique();
      await ctx.db.patch(profile!._id, { inAppOptOuts: ["crew_scheduled"], emailOptOuts: ["crew_scheduled"] });
    });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-17")._id, userId: ana._id });
    expect(await emailsTo(t, ana)).toHaveLength(1);
    const bell = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_userId_and_status_and_createdAt", (q) => q.eq("userId", ana._id))
        .collect(),
    );
    expect(bell).toEqual([]);
  });
});

describe("the add-on", () => {
  test("turning hashing on makes an added date, and off leaves a plain internal event", async () => {
    const { t, opsApi, ana } = await setup();
    const eventId = await insertPlainEvent(t, { eventType: "Crewed Event" });
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    expect(addon).toMatchObject({ origin: "addon", status: "scheduled", capacity: 3, filled: 0 });
    expect(await getRow(t, addon!.hashDateId)).toMatchObject({ quarterId: QUARTER, dateKey: "2026-11-03", eventId });
    expect((await getEvent(t, eventId))?.hashingEnabled).toBe(true);

    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: addon!.hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: false });
    expect(await opsApi.query(api.hashing.getEventAddon, { eventId })).toBeNull();
    expect(await shiftsOf(t, eventId)).toEqual([]);
    expect(await getEvent(t, eventId)).toMatchObject({ hashingEnabled: false, status: "ready" });
  });

  test("on refuses anything that can't be a hash", async () => {
    const { t, opsApi } = await setup();
    const on = (eventId: Id<"events">) => opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    await expect(on(await insertPlainEvent(t, { visibility: "public" }))).rejects.toThrow(/internal events/);
    await expect(
      on(await insertPlainEvent(t, { startAt: new Date("2026-12-20T20:00:00Z").getTime(), endAt: new Date("2026-12-20T21:00:00Z").getTime() })),
    ).rejects.toThrow(/first day of classes through finals/);
    await expect(on(await insertPlainEvent(t, { startAt: NOW - 2 * HOUR, endAt: NOW - HOUR }))).rejects.toThrow(/already started/);
    await expect(on(await insertPlainEvent(t, { endAt: NOW + 48 * HOUR + 9 * HOUR }))).rejects.toThrow(/15–480 minutes/);
    const invoiced = await insertPlainEvent(t);
    const invoiceId = await insertInvoice(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(invoiced, { invoiceId });
    });
    await expect(on(invoiced)).rejects.toThrow(/can't have an invoice/);
  });

  async function addonOn(context: Context, booked: TestUser[]) {
    const { t, opsApi } = context;
    const eventId = await insertPlainEvent(t);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    for (const person of booked) {
      await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: addon!.hashDateId, userId: person._id });
    }
    return { eventId, hashDateId: addon!.hashDateId };
  }

  test("a lapsed add-on hash ends its bookings and leaves the event running as a plain event", async () => {
    const context = await setup();
    const { t, opsApi, ana } = context;
    const { eventId, hashDateId } = await addonOn(context, [ana]);
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z").getTime());
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});

    expect(await shiftsOf(t, eventId)).toEqual([]);
    expect(await getEvent(t, eventId)).toMatchObject({ status: "ready", hashingEnabled: false });
    expect(await getRow(t, hashDateId)).toMatchObject({ status: "lapsed", eventId });
    expect(await opsApi.query(api.hashing.getEventAddon, { eventId })).toBeNull();
    await opsApi.mutation(api.events.update, { id: eventId, startAt: NOW + 72 * HOUR, endAt: NOW + 73 * HOUR });
    expect((await getEvent(t, eventId))?.startAt).toBe(NOW + 72 * HOUR);
  });

  test("an event whose add-on lapsed can become a hash again once it's ahead of now", async () => {
    const context = await setup();
    const { t, opsApi } = context;
    const { eventId, hashDateId } = await addonOn(context, []);
    const later = new Date("2026-11-05T12:00:00Z").getTime();
    vi.setSystemTime(later);
    await t.mutation(internal.hashingSchedule.closeLapsedHashes, {});
    await opsApi.mutation(api.events.update, { id: eventId, startAt: later + 24 * HOUR, endAt: later + 25 * HOUR });

    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    expect(addon).toMatchObject({ origin: "addon", status: "scheduled" });
    expect(addon?.hashDateId).not.toBe(hashDateId);
    expect(await getRow(t, hashDateId)).toBeNull();
  });

  test.each(["setDateOff", "removeDate"] as const)("%s on an add-on hash leaves the event, and takes the date", async (how) => {
    const context = await setup();
    const { t, opsApi, ana } = context;
    const { eventId, hashDateId } = await addonOn(context, [ana]);
    if (how === "setDateOff") await opsApi.mutation(api.hashingSchedule.setDateOff, { hashDateId, off: true });
    else await opsApi.mutation(api.hashingSchedule.removeDate, { hashDateId });

    expect(await getRow(t, hashDateId)).toBeNull();
    expect(await shiftsOf(t, eventId)).toEqual([]);
    expect(await getEvent(t, eventId)).toMatchObject({ status: "ready", hashingEnabled: false });
  });

  test("off is refused for an added date, whose event has no life outside Hashing", async () => {
    const { t, opsApi } = await setup();
    const hashDateId = await opsApi.mutation(api.hashingSchedule.addDate, {
      quarterId: QUARTER,
      dateKey: "2026-11-06",
      startTime: "11:00",
      capacity: 2,
    });
    const eventId = (await getRow(t, hashDateId))!.eventId!;
    await expect(opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: false })).rejects.toThrow(/Remove it in Hashing/);
    expect((await getEvent(t, eventId))?.hashingEnabled).toBe(true);
  });

  test("on refuses an event with any crew", async () => {
    const { t, opsApi, ana } = await setup();
    const on = (eventId: Id<"events">) => opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const crew = /Remove its crew first/;
    const addShift = (eventId: Id<"events">, fields: { role: string; userId?: string; crewApplicationId?: Id<"crewApplications"> }) =>
      t.run(async (ctx) => {
        await ctx.db.insert("eventCrewShifts", {
          eventId,
          startsAt: NOW + 48 * HOUR,
          endsAt: NOW + 50 * HOUR,
          hours: 2,
          postedToExpense: false,
          createdAt: NOW,
          updatedAt: NOW,
          ...fields,
        });
      });

    const staffed = await insertPlainEvent(t);
    await addShift(staffed, { role: "FOH", userId: ana._id });
    await expect(on(staffed)).rejects.toThrow(crew);

    const openSlot = await insertPlainEvent(t);
    await addShift(openSlot, { role: "FOH" });
    await expect(on(openSlot)).rejects.toThrow(crew);

    const trainee = await insertPlainEvent(t);
    await addShift(trainee, { role: "Trainee", crewApplicationId: await insertApplication(t) });
    await expect(on(trainee)).rejects.toThrow(crew);

    expect((await getEvent(t, staffed))?.hashingEnabled).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.query("hashDates").collect()).filter((row) => row.eventId === staffed))).toEqual([]);
  });

  test("on takes an event with no blocks or one custom section, and refuses any other schedule", async () => {
    const { t, opsApi, ana } = await setup();
    const on = (eventId: Id<"events">) => opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const addBlock = (eventId: Id<"events">, blockType: "custom" | "show", startsAt: number, endsAt: number) =>
      t.run(async (ctx) =>
        ctx.db.insert("eventScheduleBlocks", {
          eventId,
          blockType,
          label: "Deep clean",
          dayIndex: 0,
          startsAt,
          endsAt,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      );

    const show = await insertPlainEvent(t);
    await addBlock(show, "show", NOW + 48 * HOUR, NOW + 49 * HOUR);
    await expect(on(show)).rejects.toThrow(/Clear its schedule first/);

    const two = await insertPlainEvent(t);
    await addBlock(two, "custom", NOW + 48 * HOUR, NOW + 49 * HOUR);
    await addBlock(two, "custom", NOW + 49 * HOUR, NOW + 50 * HOUR);
    await expect(on(two)).rejects.toThrow(/Clear its schedule first/);

    const eventId = await insertPlainEvent(t);
    const blockId = await addBlock(eventId, "custom", NOW + 48 * HOUR, NOW + 49 * HOUR);
    await on(eventId);
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    const row = await getRow(t, addon!.hashDateId);
    expect(row?.sectionBlockId).toBe(blockId);
    expect(await blocksOf(t, eventId)).toMatchObject([
      { _id: blockId, label: "Deep clean", startsAt: NOW + 48 * HOUR, endsAt: NOW + 50 * HOUR },
    ]);

    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: addon!.hashDateId, userId: ana._id });
    const [block] = await blocksOf(t, eventId);
    const saved = { id: block!._id, blockType: block!.blockType, label: "Sweep", startsAt: block!.startsAt, endsAt: block!.endsAt };
    await opsApi.mutation(api.eventSchedule.upsertBlocks, { eventId, blocks: [saved] });
    const [shift] = await shiftsOf(t, eventId);
    await opsApi.mutation(api.eventCrew.upsertShifts, {
      eventId,
      shifts: [
        {
          id: shift!._id,
          scheduleBlockId: shift!.scheduleBlockId,
          role: shift!.role,
          userId: shift!.userId,
          startsAt: shift!.startsAt,
          endsAt: shift!.endsAt,
          postedToExpense: false,
        },
      ],
    });
    expect(await shiftsOf(t, eventId)).toMatchObject([{ scheduleBlockId: blockId, userId: ana._id }]);
  });

  test("off is refused once started, and for a regular date", async () => {
    const context = await setup();
    const { t, opsApi, ana, eventOf } = context;
    await expect(
      opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId: eventOf("2026-11-17"), enabled: false }),
    ).rejects.toThrow(/regular hash/);

    const eventId = await insertPlainEvent(t);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: addon!.hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingLive.start, { hashDateId: addon!.hashDateId });
    await expect(opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: false })).rejects.toThrow(/already started/);
  });

  test("crew can't touch the add-on", async () => {
    const { t, anaApi } = await setup();
    const eventId = await insertPlainEvent(t);
    await expect(anaApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true })).rejects.toThrow(/access/i);
    await expect(anaApi.query(api.hashing.getEventAddon, { eventId })).rejects.toThrow(/access/i);
  });
});

describe("where a hash shows up", () => {
  test("the public site, calendar, newsletter and booking calendar never see it", async () => {
    const context = await setup();
    const { t, opsApi, ana, on, eventOf } = context;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-03")._id, userId: ana._id });
    const publicEvent = await insertPlainEvent(t, { visibility: "public" });

    const titlesOf = (rows: { eventId: Id<"events"> }[]) => rows.map((row) => row.eventId);
    const anon = t;
    expect(titlesOf(await anon.query(api.publicEvents.listUpcoming, { now: NOW }))).toEqual([publicEvent]);
    expect(await anon.query(api.publicEvents.getByEventId, { eventId: eventOf("2026-11-03") })).toBeNull();
    const happening = await anon.query(api.publicEvents.listHappeningNow, {});
    expect(happening.map((row) => row.eventId)).not.toContain(eventOf("2026-11-03"));

    const { calendar, newsletter, load } = await t.run(async (ctx) => ({
      calendar: await loadPublicCalendarEvents(ctx, NOW),
      newsletter: await buildThisWeekAtArbor(ctx, NOW),
      load: await buildPublicBookingDayLoad(ctx, "2026-11-01", "2026-11-30"),
    }));
    expect(JSON.stringify(calendar)).not.toContain("Hash");
    expect(JSON.stringify(newsletter)).not.toContain("Hash");
    expect(load).toEqual({ "2026-11-03": { count: 1, level: expect.any(String) } });
  });

  test("no CoHo card for a hash, though the same person gets one on a real shift", async () => {
    const context = await setup();
    const { t, anaApi, ana, on } = context;
    await t.run(async (ctx) => {
      await ctx.db.insert("cohoGiftCards", {
        label: "CoHo main",
        secureToken: "token",
        cardNumber: "6001234567890",
        balanceUsd: 100,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    await context.opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-03")._id, userId: ana._id });
    vi.setSystemTime(on("2026-11-03").startsAt - HOUR);
    expect(await anaApi.query(api.cohoGiftCard.getMyCohoGiftCard, { refreshTick: 1 })).toBeNull();

    const row = on("2026-11-03");
    await t.run(async (ctx) => {
      await ctx.db.insert("eventCrewShifts", {
        eventId: await ctx.db.insert("events", {
          title: "Real show",
          status: "ready",
          visibility: "public",
          startAt: row.startsAt,
          endAt: row.endsAt,
          timezone: "America/Los_Angeles",
          spansMultipleDays: false,
          setupOnly: false,
          strikeOnly: false,
          requiresShowWindow: false,
          createdAt: NOW,
          updatedAt: NOW,
        }),
        role: "FOH",
        userId: ana._id,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        hours: 1,
        postedToExpense: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    expect(await anaApi.query(api.cohoGiftCard.getMyCohoGiftCard, { refreshTick: 1 })).toEqual({ cardNumber: "6001234567890" });
  });

  test("no review or photos after a hash, even if a show block reaches it", async () => {
    const context = await setup();
    const { t, opsApi, anaApi, ana } = context;
    const eventId = await insertPlainEvent(t);
    const event = await getEvent(t, eventId);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("eventScheduleBlocks", {
        eventId,
        blockType: "show",
        label: "Show",
        dayIndex: 0,
        startsAt: event!.startAt,
        endsAt: event!.endAt,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const addon = await opsApi.query(api.hashing.getEventAddon, { eventId });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: addon!.hashDateId, userId: ana._id });
    const block = (await blocksOf(t, eventId)).find((candidate) => candidate.blockType === "show");
    await t.run(async (ctx) => {
      const [shift] = await ctx.db.query("eventCrewShifts").collect();
      await ctx.db.patch(shift!._id, { scheduleBlockId: block!._id });
    });
    await opsApi.mutation(api.hashingLive.start, { hashDateId: addon!.hashDateId });
    await opsApi.mutation(api.hashingLive.finish, { hashDateId: addon!.hashDateId, attendeeUserIds: [ana._id] });
    expect(await anaApi.query(api.crewPortal.listMyPostEventWork, { now: event!.endAt + 24 * HOUR })).toEqual([]);
  });

  test("no night to answer, no open position, no count in Insights", async () => {
    const { t, opsApi, anaApi } = await setup();
    const eventId = await insertPlainEvent(t, { eventType: "Crewed Event" });
    await t.run(async (ctx) => {
      await ctx.db.insert("eventArtistNeeds", { eventId, status: "open", createdAt: NOW, updatedAt: NOW });
    });
    const range = { startMs: NOW, endMs: NOW + 40 * 24 * HOUR };
    expect((await anaApi.query(api.crewNights.listMine, { now: NOW, weeksAhead: 3 })).length).toBeGreaterThan(0);
    await opsApi.mutation(api.hashingSchedule.setEventHashing, { eventId, enabled: true });

    expect(await anaApi.query(api.crewNights.listMine, { now: NOW, weeksAhead: 3 })).toEqual([]);
    expect((await opsApi.query(api.analyticsDemand.getEventsVolume, range)).total).toBe(0);
    expect((await opsApi.query(api.eventArtistNeeds.listOpenPositions, {})).events).toEqual([]);
    expect((await opsApi.query(api.analyticsCrew.getCrewSchedulingKpis, range)).noSlotEvents).toBe(0);
  });

  test("Upcoming shifts, the on-shift card and the digest's shifts carry it, pointing at the runner", async () => {
    const { opsApi, anaApi, ana, on } = await setup();
    const row = on("2026-11-03");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });
    expect(await anaApi.query(api.crewPortal.listMyScheduledEvents, { now: NOW })).toMatchObject([
      { title: "Hash", hashDateId: row._id, venueName: "The closet" },
    ]);
    expect(await anaApi.query(api.crewPortal.listMyActiveShifts, { now: row.startsAt })).toMatchObject([
      { title: "Hash", hashDateId: row._id, phase: "now" },
    ]);
  });

  test("a clash on another event shows from both sides, but a hash doesn't flag itself", async () => {
    const { t, opsApi, anaApi, ana, on, eventOf } = await setup();
    const row = on("2026-11-03");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.dates[0]?.eventTitle).toBeUndefined();

    const eventId = await insertPlainEvent(t, { startAt: row.startsAt, endAt: row.endsAt + HOUR, eventType: "Crewed Event" });
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { title: "Real show" });
      await ctx.db.insert("eventCrewShifts", {
        eventId,
        role: "FOH",
        userId: ana._id,
        startsAt: row.startsAt,
        endsAt: row.endsAt + HOUR,
        hours: 2,
        postedToExpense: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.dates[0]?.eventTitle).toBe("Real show");
    const conflicts = await opsApi.query(api.eventCrew.listCrewConflictsForEvent, { eventId, userIds: [ana._id] });
    expect(conflicts.conflicts).toMatchObject([{ userId: ana._id, eventId: eventOf("2026-11-03"), eventTitle: "Hash" }]);
  });

  test("Insights counts the crew cost and hours but not the event", async () => {
    const context = await setup();
    const { opsApi, ana } = context;
    const hashDateId = await bookAndRun(context, "2026-11-03", [ana]);
    await opsApi.mutation(api.hashingLive.finish, { hashDateId, attendeeUserIds: [ana._id] });
    const range = { startMs: NOW, endMs: NOW + 40 * 24 * HOUR };
    expect((await opsApi.query(api.analytics.getFinancialSummary, range)).eventCostsUsd).toBe(20);
    expect((await opsApi.query(api.analyticsCrew.getCrewHoursAndOt, range)).totalHours).toBe(1);
    expect((await opsApi.query(api.analyticsDemand.getEventsVolume, range)).total).toBe(0);
  });
});
