// @vitest-environment edge-runtime
import { addPacificCalendarDays, pacificDateAndTimeToMs, pacificDateKey } from "@arbor/format";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { convertLegacyResponseRow } from "./lib/crewNightConversion";
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

const NIGHT = pacificDateKey(addPacificCalendarDays(Date.now(), 10));
const at = (time: string) => pacificDateAndTimeToMs(NIGHT, time)!;

async function setup() {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  return { t, arbor };
}

async function crewMember(
  t: Test,
  arbor: { organizationId: string },
  opts: { disciplines?: Array<"Sound" | "Lights">; email?: string } = {},
) {
  const user = await createUser(t, opts.email ? { email: opts.email } : {});
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      status: "active",
      verticals: ["Crew"],
      disciplines: opts.disciplines ?? ["Sound"],
      createdAt: now,
      updatedAt: now,
    });
  });
  return user;
}

/** A crewed Sound event on NIGHT with setup → show, plus an optional early setup. */
async function seedEvent(
  t: Test,
  title: string,
  times: { setup: string; start: string; end: string; earlySetup?: string },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      title,
      status: "tentative",
      visibility: "internal",
      startAt: at(times.start),
      endAt: at(times.end),
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });
    const blocks: Array<{ blockType: "setup" | "show"; label: string; from: string; to: string }> = [
      ...(times.earlySetup
        ? [{ blockType: "setup" as const, label: "Early setup", from: times.earlySetup, to: times.setup }]
        : []),
      { blockType: "setup", label: "Setup", from: times.setup, to: times.start },
      { blockType: "show", label: "Show", from: times.start, to: times.end },
    ];
    const blockIds: Id<"eventScheduleBlocks">[] = [];
    for (const block of blocks) {
      blockIds.push(
        await ctx.db.insert("eventScheduleBlocks", {
          eventId,
          blockType: block.blockType,
          label: block.label,
          dayIndex: 0,
          startsAt: at(block.from),
          endsAt: at(block.to),
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return { eventId, blockIds };
  });
}

async function summaryFor(t: Test, staff: TestUser, eventId: Id<"events">, userId: string) {
  const summary = await asUser(t, staff).query(api.eventCrewAvailability.getSummaryForEvent, { eventId });
  return summary?.responders.find((responder) => responder.userId === userId);
}

test("two overlapping events on one night are one card, answered once for both", async () => {
  const { t, arbor } = await setup();
  const crew = await crewMember(t, arbor);
  const staff = await crewMember(t, arbor);
  const a = await seedEvent(t, "Event A", { setup: "17:00", start: "19:00", end: "22:00" });
  const b = await seedEvent(t, "Event B", { setup: "20:00", start: "21:00", end: "23:30" });

  const nights = await asUser(t, crew).query(api.crewNights.listMine, { now: Date.now(), weeksAhead: 3 });
  expect(nights).toHaveLength(1);
  expect(nights[0]!.nightKey).toBe(NIGHT);
  expect(nights[0]!.events.map((event) => event.title).sort()).toEqual(["Event A", "Event B"]);
  expect([nights[0]!.startsAt, nights[0]!.endsAt]).toEqual([at("17:00"), at("23:30")]);
  expect(nights[0]!.answer).toBeNull();

  // Not answered yet: both events list them as pending.
  const pending = await asUser(t, staff).query(api.eventCrewAvailability.listPendingCrewForEvent, {
    eventId: b.eventId,
  });
  expect(pending?.pendingCrew.map((person) => person.userId)).toContain(crew._id);

  await asUser(t, crew).mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "free" });

  expect((await summaryFor(t, staff, a.eventId, crew._id))?.responseStatus).toBe("yes");
  expect((await summaryFor(t, staff, b.eventId, crew._id))?.responseStatus).toBe("yes");
  const after = await asUser(t, crew).query(api.crewNights.listMine, { now: Date.now(), weeksAhead: 3 });
  expect(after[0]!.answer).toMatchObject({ status: "free", coversNight: true });
  const badgeArgs = {
    now: Date.now(),
    rangeStart: Date.now(),
    rangeEnd: Date.now() + 21 * 86_400_000,
    includeArborInternal: true,
    includeAdmin: false,
    includeBand: false,
  };
  const other = await crewMember(t, arbor);
  expect((await asUser(t, other).query(api.navBadges.getNavBadges, badgeArgs)).pendingAvailability).toBe(1);
  expect((await asUser(t, crew).query(api.navBadges.getNavBadges, badgeArgs)).pendingAvailability).toBe(0);
});

test("only part and early setup only become part of the events they overlap", async () => {
  const { t, arbor } = await setup();
  const crew = await crewMember(t, arbor);
  const staff = await crewMember(t, arbor);
  const a = await seedEvent(t, "With early setup", {
    earlySetup: "16:00",
    setup: "17:00",
    start: "19:00",
    end: "22:00",
  });
  const b = await seedEvent(t, "Late one", { setup: "21:00", start: "22:00", end: "23:30" });

  const [night] = await asUser(t, crew).query(api.crewNights.listMine, { now: Date.now() });
  expect(night!.earlySetup).toEqual([{ startsAt: at("16:00"), endsAt: at("17:00") }]);

  await asUser(t, crew).mutation(api.crewNights.answerNight, {
    nightKey: NIGHT,
    status: "partial",
    earlySetupOnly: true,
  });
  const early = await summaryFor(t, staff, a.eventId, crew._id);
  expect(early?.responseStatus).toBe("partial");
  expect(early?.partialWindows?.[0]).toMatchObject({ scheduleBlockId: a.blockIds[0] });
  expect((await summaryFor(t, staff, b.eventId, crew._id))?.responseStatus).toBe("no");

  await asUser(t, crew).mutation(api.crewNights.answerNight, {
    nightKey: NIGHT,
    status: "partial",
    windows: [{ startsAt: at("21:00"), endsAt: at("23:30") }],
  });
  expect((await summaryFor(t, staff, b.eventId, crew._id))?.responseStatus).toBe("yes");
  expect((await summaryFor(t, staff, a.eventId, crew._id))?.responseStatus).toBe("partial");

  await asUser(t, crew).mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "backup" });
  expect((await summaryFor(t, staff, a.eventId, crew._id))?.responseStatus).toBe("only_if_necessary");
});

test("a crew member only ever writes and reads their own nights", async () => {
  const { t, arbor } = await setup();
  const alice = await crewMember(t, arbor);
  const bob = await crewMember(t, arbor);
  await seedEvent(t, "Shared night", { setup: "17:00", start: "19:00", end: "22:00" });

  await asUser(t, alice).mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "no" });

  const bobs = await asUser(t, bob).query(api.crewNights.listMine, { now: Date.now() });
  expect(bobs[0]!.answer).toBeNull();
  await asUser(t, bob).mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "free" });

  const rows = await t.run((ctx) => ctx.db.query("crewAvailabilityNights").collect());
  expect(rows.map((row) => [row.userId, row.status]).sort()).toEqual(
    [
      [alice._id, "no"],
      [bob._id, "free"],
    ].sort(),
  );
});

test("people without a crew specialty, or signed out, can't answer", async () => {
  const { t, arbor } = await setup();
  const ops = await createUser(t);
  await addMembership(t, ops._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, ops._id, arbor.organizationId);
  await seedEvent(t, "Night", { setup: "17:00", start: "19:00", end: "22:00" });

  await expect(
    asUser(t, ops).mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "free" }),
  ).rejects.toThrow(/crew specialties/);
  await expect(t.mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "free" })).rejects.toThrow();
  expect(await asUser(t, ops).query(api.crewNights.listMine, { now: Date.now() })).toEqual([]);
});

test("answers are checked: a past night, early setup on a night without one, empty part", async () => {
  const { t, arbor } = await setup();
  const crew = await crewMember(t, arbor);
  await seedEvent(t, "Night", { setup: "17:00", start: "19:00", end: "22:00" });
  const as = asUser(t, crew);

  await expect(as.mutation(api.crewNights.answerNight, { nightKey: "2020-01-03", status: "no" })).rejects.toThrow(
    /already passed/,
  );
  await expect(
    as.mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "partial", earlySetupOnly: true }),
  ).rejects.toThrow(/early setup/);
  await expect(as.mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "partial" })).rejects.toThrow(
    /part of the night/,
  );
});

test("usual evenings: suggested from the application, Thu/Fri/Sat required, asked once", async () => {
  const { t, arbor } = await setup();
  const crew = await crewMember(t, arbor, { email: "night.owl@arbor.test" });
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("crewApplications", {
      status: "converted",
      name: "Night Owl",
      email: "night.owl@arbor.test",
      phone: "6505550100",
      heardAboutUs: "friend",
      vertical: "Crew",
      discipline: "Sound",
      crewAvailabilityDays: ["friday", "saturday"],
      stanfordPosition: "undergrad",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  const as = asUser(t, crew);

  const before = await as.query(api.crewNights.getMyUsualEvenings, {});
  expect(before?.suggested).toEqual({ friday: "usually", saturday: "usually" });
  expect(before?.setAt).toBeUndefined();
  expect((await as.query(api.users.getSessionShell, {}))?.viewer.needsUsualEvenings).toBe(true);

  await expect(
    as.mutation(api.crewNights.setMyUsualEvenings, { usualEvenings: { friday: "usually" } }),
  ).rejects.toThrow(/Thursday, Friday and Saturday/);

  await as.mutation(api.crewNights.setMyUsualEvenings, {
    usualEvenings: { thursday: "rarely", friday: "usually", saturday: "sometimes", sunday: "usually" },
  });
  const after = await as.query(api.crewNights.getMyUsualEvenings, {});
  expect(after?.usualEvenings).toEqual({
    thursday: "rarely",
    friday: "usually",
    saturday: "sometimes",
    sunday: "usually",
  });
  expect((await as.query(api.users.getSessionShell, {}))?.viewer.needsUsualEvenings).toBe(false);
});

test("dates I'm away mark each night as not this one", async () => {
  const { t, arbor } = await setup();
  const crew = await crewMember(t, arbor);
  const staff = await crewMember(t, arbor);
  const { eventId } = await seedEvent(t, "Night", { setup: "17:00", start: "19:00", end: "22:00" });
  const from = pacificDateKey(addPacificCalendarDays(Date.now(), 9));
  const to = pacificDateKey(addPacificCalendarDays(Date.now(), 11));

  expect(
    await asUser(t, crew).mutation(api.crewNights.markAway, { fromNightKey: from, toNightKey: to }),
  ).toBe(3);
  expect((await summaryFor(t, staff, eventId, crew._id))?.responseStatus).toBe("no");
});

test("converting old answers merges into the night, keeps own answers, and is idempotent", async () => {
  const { t, arbor } = await setup();
  const crew = await crewMember(t, arbor);
  const staff = await crewMember(t, arbor);
  const a = await seedEvent(t, "A", { setup: "17:00", start: "19:00", end: "22:00" });
  const b = await seedEvent(t, "B", { setup: "20:00", start: "21:00", end: "23:30" });
  const today = pacificDateKey(Date.now());

  const legacy = await t.run(async (ctx) => {
    const now = Date.now();
    const yes = await ctx.db.insert("eventCrewAvailabilityResponses", {
      eventId: a.eventId,
      userId: crew._id,
      responseStatus: "yes",
      respondedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const no = await ctx.db.insert("eventCrewAvailabilityResponses", {
      eventId: b.eventId,
      userId: crew._id,
      responseStatus: "no",
      notes: "class",
      respondedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return [yes, no];
  });

  const convertAll = () =>
    t.run(async (ctx) => {
      for (const id of legacy) {
        const row = (await ctx.db.get(id))!;
        await convertLegacyResponseRow(ctx, row, today);
      }
    });
  await convertAll();
  const once = await t.run((ctx) => ctx.db.query("crewAvailabilityNights").collect());
  expect(once).toHaveLength(1);
  expect(once[0]).toMatchObject({
    nightKey: NIGHT,
    status: "free",
    windows: [{ startsAt: at("17:00"), endsAt: at("22:00") }],
    notes: "class",
    source: "converted",
  });
  // The yes was for A's span only, so B (later) reads as partial.
  expect((await summaryFor(t, staff, a.eventId, crew._id))?.responseStatus).toBe("yes");
  expect((await summaryFor(t, staff, b.eventId, crew._id))?.responseStatus).toBe("partial");

  await convertAll();
  const twice = await t.run((ctx) => ctx.db.query("crewAvailabilityNights").collect());
  expect(twice.map(({ updatedAt: _u, ...row }) => row)).toEqual(once.map(({ updatedAt: _u, ...row }) => row));

  // Once the person answers themselves, conversion leaves the night alone.
  await asUser(t, crew).mutation(api.crewNights.answerNight, { nightKey: NIGHT, status: "no" });
  await convertAll();
  const kept = await t.run((ctx) => ctx.db.query("crewAvailabilityNights").collect());
  expect(kept[0]).toMatchObject({ status: "no", source: "answer" });
  // The old rows are still there.
  expect(await t.run((ctx) => ctx.db.query("eventCrewAvailabilityResponses").collect())).toHaveLength(2);
});
