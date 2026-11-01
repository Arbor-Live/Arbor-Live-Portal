// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { HASHING_DEFAULTS } from "./lib/hashing";
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
  });
  return user;
}

async function setup() {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const ops = await member(t, arbor, { verticals: ["Operations"], name: "Olive Ops", includeInTimecards: false });
  const ana = await member(t, arbor, { name: "Ana Crew" });
  const ben = await member(t, arbor, { name: "Ben Crew" });
  return { t, arbor, ops, ana, ben, opsApi: asUser(t, ops), anaApi: asUser(t, ana), benApi: asUser(t, ben) };
}

async function setupWithDates() {
  const context = await setup();
  await context.opsApi.mutation(api.hashingSchedule.saveSetup, SETUP);
  const dates = await context.t.run(async (ctx) =>
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
  return { ...context, dates, on };
}

function bookingsOf(t: Test) {
  return t.run(async (ctx) => ctx.db.query("hashBookings").collect());
}

function answersOf(t: Test) {
  return t.run(async (ctx) => ctx.db.query("hashAvailability").collect());
}

function checksOf(t: Test, hashDateId: Id<"hashDates">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("hashChecks")
      .withIndex("by_hashDateId_and_itemKey", (q) => q.eq("hashDateId", hashDateId))
      .collect(),
  );
}

async function getDate(t: Test, id: Id<"hashDates">) {
  return await t.run(async (ctx) => ctx.db.get(id));
}

async function notificationTitles(t: Test, user: TestUser) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_userId_and_status_and_createdAt", (q) => q.eq("userId", user._id))
      .collect(),
  );
  return rows.map((row) => row.title);
}

const ITEM = "large-packout:event-kit:event-kit-1";
const OTHER_ITEM = "large-packout:event-kit:event-kit-2";

describe("setup", () => {
  test("builds the rest of the quarter, with off weeks off", async () => {
    const { dates } = await setupWithDates();
    expect(dates.map((row) => [row.dateKey, row.status])).toEqual([
      ["2026-11-03", "scheduled"],
      ["2026-11-10", "scheduled"],
      ["2026-11-17", "scheduled"],
      ["2026-11-24", "off"],
      ["2026-12-01", "scheduled"],
      ["2026-12-08", "off"],
    ]);
    expect(dates.every((row) => row.origin === "regular" && row.capacity === 3)).toBe(true);
  });

  test("saving again changes nothing and tells nobody", async () => {
    const { t, opsApi, ana, on, dates } = await setupWithDates();
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-17")._id, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.saveSetup, SETUP);
    const after = await t.run(async (ctx) => ctx.db.query("hashDates").collect());
    expect(after.map((row) => row._id).sort()).toEqual(dates.map((row) => row._id).sort());
    expect((await bookingsOf(t))[0]?.status).toBe("booked");
    expect(await notificationTitles(t, ana)).toHaveLength(1);
  });

  test("inserts the seed checklist once, lazily", async () => {
    const { t, opsApi } = await setupWithDates();
    await opsApi.mutation(api.hashingSchedule.saveSetup, SETUP);
    const versions = await t.run(async (ctx) => ctx.db.query("hashChecklistVersions").collect());
    expect(versions.map((row) => row.version)).toEqual([1]);
  });

  test("a booked date keeps its people when the new weekday has passed this week", async () => {
    const { t, opsApi, ana, on } = await setupWithDates();
    const hashDateId = on("2026-11-03")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    vi.setSystemTime(new Date("2026-11-03T17:00:00Z").getTime());
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, weekday: 1 });
    expect((await getDate(t, hashDateId))?.dateKey).toBe("2026-11-03");
    expect(await bookingsOf(t)).toMatchObject([{ hashDateId, status: "booked" }]);
  });

  test("changing the weekday shifts unmoved dates and asks people to re-confirm", async () => {
    const { t, opsApi, anaApi, ana, ben, on } = await setupWithDates();
    const booked = on("2026-11-17");
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: booked._id, answer: "can" });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: booked._id, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-10")._id, userId: ben._id });

    const moved = on("2026-12-01");
    await opsApi.mutation(api.hashingSchedule.moveDate, {
      hashDateId: moved._id,
      dateKey: "2026-12-03",
      startTime: "12:00",
    });
    const added = await opsApi.mutation(api.hashingSchedule.addDate, {
      quarterId: QUARTER,
      dateKey: "2026-11-05",
      startTime: "10:00",
      capacity: 2,
    });

    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, weekday: 4 });

    expect((await getDate(t, booked._id))?.dateKey).toBe("2026-11-19");
    expect((await getDate(t, moved._id))?.dateKey).toBe("2026-12-03");
    expect((await getDate(t, added))?.dateKey).toBe("2026-11-05");

    const bookings = await bookingsOf(t);
    expect(bookings.map((row) => row.status)).toEqual(["needs_confirmation", "needs_confirmation"]);
    expect(await answersOf(t)).toEqual([]);
    const titles = await notificationTitles(t, ana);
    expect(titles.some((title) => title.startsWith("Hash moved: Thu, Nov 19"))).toBe(true);
  });

  test("changing the time keeps the date but re-confirms; capacity alone does not", async () => {
    const { t, opsApi, ana, on } = await setupWithDates();
    const row = on("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });

    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, spotsPerHash: 5, location: "Annex" });
    expect((await bookingsOf(t))[0]?.status).toBe("booked");
    expect((await getDate(t, row._id))?.capacity).toBe(5);

    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, startTime: "17:00" });
    expect((await getDate(t, row._id))?.dateKey).toBe("2026-11-17");
    expect((await bookingsOf(t))[0]?.status).toBe("needs_confirmation");
  });

  test("a started hash ignores setup changes", async () => {
    const { t, opsApi, on } = await setupWithDates();
    const row = on("2026-11-03");
    await opsApi.mutation(api.hashingLive.start, { hashDateId: row._id });
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, weekday: 4 });
    expect((await getDate(t, row._id))?.dateKey).toBe("2026-11-03");
  });

  test("builds the next quarter from the saved setup", async () => {
    const { t, opsApi } = await setupWithDates();
    await opsApi.mutation(api.hashingSchedule.buildQuarter, { quarterId: "2026-27-winter" });
    const winter = await t.run(async (ctx) =>
      ctx.db
        .query("hashDates")
        .withIndex("by_quarterId_and_dateKey", (q) => q.eq("quarterId", "2026-27-winter"))
        .collect(),
    );
    expect(winter[0]?.dateKey).toBe("2027-01-05");
    expect(winter.at(-1)).toMatchObject({ dateKey: "2027-03-16", status: "off" });
  });

  test("a next quarter already built follows later setup changes", async () => {
    const { t, opsApi } = await setupWithDates();
    await opsApi.mutation(api.hashingSchedule.buildQuarter, { quarterId: "2026-27-winter" });
    await opsApi.mutation(api.hashingSchedule.saveSetup, { ...SETUP, weekday: 4 });
    const winter = await t.run(async (ctx) =>
      ctx.db
        .query("hashDates")
        .withIndex("by_quarterId_and_dateKey", (q) => q.eq("quarterId", "2026-27-winter"))
        .collect(),
    );
    expect(winter[0]?.dateKey).toBe("2027-01-07");
  });
});

describe("moving, adding, removing", () => {
  test("moveDate records the original date and clears answers", async () => {
    const { t, opsApi, anaApi, ana, ben, on } = await setupWithDates();
    const row = on("2026-11-17");
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: row._id, answer: "can" });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ben._id });
    await opsApi.mutation(api.hashingSchedule.moveDate, {
      hashDateId: row._id,
      dateKey: "2026-11-25",
      startTime: "16:00",
    });
    await opsApi.mutation(api.hashingSchedule.moveDate, {
      hashDateId: row._id,
      dateKey: "2026-11-26",
      startTime: "16:00",
    });
    expect(await getDate(t, row._id)).toMatchObject({
      dateKey: "2026-11-26",
      movedFromDateKey: "2026-11-17",
      status: "scheduled",
    });
    expect(await answersOf(t)).toEqual([]);
    expect((await bookingsOf(t))[0]?.status).toBe("needs_confirmation");
    expect(await notificationTitles(t, ana)).toEqual([]);
  });

  test("moveDate refuses a started hash and a date outside the quarter", async () => {
    const { opsApi, on } = await setupWithDates();
    await expect(
      opsApi.mutation(api.hashingSchedule.moveDate, {
        hashDateId: on("2026-11-17")._id,
        dateKey: "2027-01-05",
        startTime: "16:00",
      }),
    ).rejects.toThrow(/Pick a date in Autumn 2026/);
    const started = on("2026-11-03");
    await opsApi.mutation(api.hashingLive.start, { hashDateId: started._id });
    await expect(
      opsApi.mutation(api.hashingSchedule.moveDate, {
        hashDateId: started._id,
        dateKey: "2026-11-05",
        startTime: "16:00",
      }),
    ).rejects.toThrow(/already started/);
  });

  test("addDate books people straight away, and removing it puts them back", async () => {
    const { t, opsApi, anaApi, ana } = await setupWithDates();
    const added = await opsApi.mutation(api.hashingSchedule.addDate, {
      quarterId: QUARTER,
      dateKey: "2026-11-06",
      startTime: "11:00",
      capacity: 2,
      bookUserIds: [ana._id],
      areaIds: ["red-shelf"],
    });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("booked");
    await opsApi.mutation(api.hashingSchedule.removeDate, { hashDateId: added });
    expect(await getDate(t, added)).toBeNull();
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");
    expect((await notificationTitles(t, ana)).some((title) => title.startsWith("Hash removed"))).toBe(true);
  });

  test("only added dates can be removed", async () => {
    const { opsApi, on } = await setupWithDates();
    await expect(
      opsApi.mutation(api.hashingSchedule.removeDate, { hashDateId: on("2026-11-17")._id }),
    ).rejects.toThrow(/Only added dates/);
  });

  test("turning a date off ends its bookings", async () => {
    const { t, opsApi, ana, on } = await setupWithDates();
    const row = on("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.setDateOff, { hashDateId: row._id, off: true });
    expect(await bookingsOf(t)).toEqual([]);
    expect((await getDate(t, row._id))?.status).toBe("off");
  });
});

describe("availability and booking", () => {
  test("answers toggle, and full dates show who's on them", async () => {
    const { t, opsApi, anaApi, benApi, ana, ben, on } = await setupWithDates();
    const row = on("2026-11-17");
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: row._id, answer: "can" });
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: row._id, answer: "cant" });
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: row._id, answer: null });
    expect(await answersOf(t)).toEqual([]);

    await t.run(async (ctx) => {
      await ctx.db.patch(row._id, { capacity: 1 });
    });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });
    const mine = await benApi.query(api.hashing.getMine, { now: NOW });
    expect(mine?.dates.find((date) => date._id === row._id)).toMatchObject({
      filled: 1,
      names: ["Ana Crew"],
    });
    await expect(
      opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ben._id }),
    ).rejects.toThrow(/is full \(1 of 1\)/);
  });

  test("one spot per person per quarter", async () => {
    const { opsApi, ana, on } = await setupWithDates();
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-17")._id, userId: ana._id });
    await expect(
      opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-10")._id, userId: ana._id }),
    ).rejects.toThrow(/already on/);
  });

  test("a date nobody started stops counting, and they can be booked again", async () => {
    const { opsApi, anaApi, ana, on } = await setupWithDates();
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-03")._id, userId: ana._id });
    const later = new Date("2026-11-05T20:00:00Z").getTime();
    expect((await anaApi.query(api.hashing.getMine, { now: later }))?.state).toBe("needs_hash");
    vi.setSystemTime(later);
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-10")._id, userId: ana._id });
    expect((await anaApi.query(api.hashing.getMine, { now: later }))?.state).toBe("booked");
  });

  test("confirming and giving up a spot", async () => {
    const { t, opsApi, anaApi, ana, on } = await setupWithDates();
    const row = on("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.moveDate, {
      hashDateId: row._id,
      dateKey: "2026-11-18",
      startTime: "16:00",
    });
    await anaApi.mutation(api.hashing.confirmBooking, { hashDateId: row._id });
    expect((await bookingsOf(t))[0]?.status).toBe("booked");
    await anaApi.mutation(api.hashing.giveUpSpot, { hashDateId: row._id });
    expect(await bookingsOf(t)).toEqual([]);
    expect((await answersOf(t))[0]?.answer).toBe("cant");
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");
  });

  test("the home prompt appears only for someone with something to do", async () => {
    const { opsApi, anaApi, ana, on, dates } = await setupWithDates();
    const scheduled = dates.filter((row) => row.status === "scheduled");
    expect((await anaApi.query(api.hashing.getMyPrompt, { now: NOW }))?.toAnswer).toBe(scheduled.length);
    for (const row of scheduled) {
      await anaApi.mutation(api.hashing.setAvailability, { hashDateId: row._id, answer: "cant" });
    }
    expect(await anaApi.query(api.hashing.getMyPrompt, { now: NOW })).toBeNull();

    const row = on("2026-11-17");
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: row._id, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.moveDate, {
      hashDateId: row._id,
      dateKey: "2026-11-19",
      startTime: "16:00",
    });
    expect((await anaApi.query(api.hashing.getMyPrompt, { now: NOW }))?.toConfirm).toHaveLength(1);
    expect(await opsApi.query(api.hashing.getMyPrompt, { now: NOW })).toBeNull();
  });

  test("the schedule ranks people and fills from availability without touching bookings", async () => {
    const { t, opsApi, anaApi, benApi, ana, ben, on } = await setupWithDates();
    const [first, second] = [on("2026-11-10"), on("2026-11-17")];
    await t.run(async (ctx) => {
      await ctx.db.patch(first._id, { capacity: 1 });
    });
    await benApi.mutation(api.hashing.setAvailability, { hashDateId: first._id, answer: "can" });
    await benApi.mutation(api.hashing.setAvailability, { hashDateId: second._id, answer: "can" });
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: first._id, answer: "can" });

    const schedule = await opsApi.query(api.hashingSchedule.getSchedule, { now: NOW });
    expect(schedule?.people.map((person) => person.name)).toEqual(["Ana Crew", "Ben Crew"]);
    expect(schedule?.summary).toMatchObject({ crew: 2, hashed: 0, booked: 0, needSpot: 2, exempt: 0 });

    const preview = await opsApi.query(api.hashingSchedule.previewFill, { now: NOW });
    expect(preview.placements.map((row) => row.name)).toEqual(["Ana Crew", "Ben Crew"]);

    await opsApi.mutation(api.hashingSchedule.applyFill, {});
    const bookings = await bookingsOf(t);
    expect(bookings.map((row) => [row.userId, row.hashDateId])).toEqual([
      [ana._id, first._id],
      [ben._id, second._id],
    ]);
    expect((await opsApi.mutation(api.hashingSchedule.applyFill, {})).booked).toBe(0);
  });
});

describe("standing", () => {
  test("none of these work shows on the schedule, and an exemption replaces it", async () => {
    const { opsApi, anaApi, ana } = await setupWithDates();
    await anaApi.mutation(api.hashing.saveNoDatesWork, {
      quarterId: QUARTER,
      reason: "Lab every Tuesday",
      suggestedTimes: "Friday mornings",
    });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("no_dates_work");
    const schedule = await opsApi.query(api.hashingSchedule.getSchedule, { now: NOW });
    expect(schedule?.cantMakeAny).toEqual([
      { userId: ana._id, name: "Ana Crew", reason: "Lab every Tuesday", suggestedTimes: "Friday mornings" },
    ]);

    await opsApi.mutation(api.hashingSchedule.exemptPerson, { userId: ana._id, quarterId: QUARTER, reason: "Abroad" });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("exempt");
    await expect(
      anaApi.mutation(api.hashing.saveNoDatesWork, { quarterId: QUARTER, reason: "x", suggestedTimes: "" }),
    ).rejects.toThrow(/already exempt/);
  });

  test("answering can clears none of these work", async () => {
    const { anaApi, on } = await setupWithDates();
    await anaApi.mutation(api.hashing.saveNoDatesWork, { quarterId: QUARTER, reason: "Lab", suggestedTimes: "" });
    await anaApi.mutation(api.hashing.setAvailability, { hashDateId: on("2026-11-17")._id, answer: "can" });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");
  });

  test("a new quarter resets standing by itself", async () => {
    const { t, anaApi, ana } = await setupWithDates();
    await anaApi.mutation(api.hashing.saveNoDatesWork, { quarterId: QUARTER, reason: "Lab", suggestedTimes: "" });
    const winterNow = new Date("2027-01-10T20:00:00Z").getTime();
    expect((await anaApi.query(api.hashing.getMine, { now: winterNow }))?.state).toBe("needs_hash");
    expect((await t.run(async (ctx) => ctx.db.query("hashQuarterStanding").collect()))[0]?.userId).toBe(ana._id);
  });

  test("advisors and inactive people owe nothing", async () => {
    const { t, arbor, on, opsApi } = await setupWithDates();
    const advisor = await member(t, arbor, { includeInTimecards: false });
    await expect(
      asUser(t, advisor).mutation(api.hashing.setAvailability, { hashDateId: on("2026-11-17")._id, answer: "can" }),
    ).rejects.toThrow(/limited to active crew/);
    await expect(
      opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-17")._id, userId: advisor._id }),
    ).rejects.toThrow(/Only active crew/);
  });
});

describe("authorization", () => {
  test("crew can't run setup, book, exempt, or publish", async () => {
    const { anaApi, ben, on } = await setupWithDates();
    const hashDateId = on("2026-11-17")._id;
    const denied = /access|Access/;
    await expect(anaApi.mutation(api.hashingSchedule.saveSetup, SETUP)).rejects.toThrow(denied);
    await expect(anaApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ben._id })).rejects.toThrow(denied);
    await expect(anaApi.mutation(api.hashingSchedule.applyFill, {})).rejects.toThrow(denied);
    await expect(anaApi.mutation(api.hashingSchedule.setDateOff, { hashDateId, off: true })).rejects.toThrow(denied);
    await expect(
      anaApi.mutation(api.hashingSchedule.moveDate, { hashDateId, dateKey: "2026-11-18", startTime: "16:00" }),
    ).rejects.toThrow(denied);
    await expect(
      anaApi.mutation(api.hashingSchedule.exemptPerson, { userId: ben._id, quarterId: QUARTER, reason: "x" }),
    ).rejects.toThrow(denied);
    await expect(
      anaApi.mutation(api.hashingChecklist.publish, { baseVersion: 1, kits: [], areas: [] }),
    ).rejects.toThrow(denied);
    await expect(anaApi.query(api.hashingSchedule.getSchedule, { now: NOW })).rejects.toThrow(denied);
    await expect(anaApi.query(api.hashingLive.getHistory, {})).rejects.toThrow(denied);
  });

  test("crew can't start, tick, flag, claim, or finish a hash they're not on", async () => {
    const { opsApi, anaApi, ben, on } = await setupWithDates();
    const hashDateId = on("2026-11-03")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ben._id });
    await expect(anaApi.mutation(api.hashingLive.start, { hashDateId })).rejects.toThrow(/not booked/);
    await opsApi.mutation(api.hashingLive.start, { hashDateId });
    const denied = /not booked/;
    await expect(anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true })).rejects.toThrow(denied);
    await expect(
      anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "missing" }),
    ).rejects.toThrow(denied);
    await expect(
      anaApi.mutation(api.hashingLive.setAreaClaim, { hashDateId, areaId: "red-shelf", claimed: true }),
    ).rejects.toThrow(denied);
    await expect(anaApi.mutation(api.hashingLive.finish, { hashDateId })).rejects.toThrow(denied);
  });

  test("a booked person can only start on the day; ops any time", async () => {
    const { opsApi, anaApi, ana, on } = await setupWithDates();
    const hashDateId = on("2026-11-17")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await expect(anaApi.mutation(api.hashingLive.start, { hashDateId })).rejects.toThrow(/on the day/);
    await opsApi.mutation(api.hashingLive.start, { hashDateId });
  });

  test("an added date can't name an area that doesn't exist", async () => {
    const { opsApi } = await setupWithDates();
    await expect(
      opsApi.mutation(api.hashingSchedule.addDate, {
        quarterId: QUARTER,
        dateKey: "2026-11-05",
        startTime: "10:00",
        capacity: 2,
        areaIds: ["no-such-area"],
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  test("dates can't go past finals", async () => {
    const { opsApi } = await setupWithDates();
    await expect(
      opsApi.mutation(api.hashingSchedule.addDate, {
        quarterId: QUARTER,
        dateKey: "2026-12-15",
        startTime: "10:00",
        capacity: 2,
      }),
    ).rejects.toThrow(/Pick a date/);
  });

  test("ops can tick a hash they aren't booked on", async () => {
    const { t, opsApi, on } = await setupWithDates();
    const hashDateId = on("2026-11-03")._id;
    await opsApi.mutation(api.hashingLive.start, { hashDateId });
    await opsApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true });
    expect(await checksOf(t, hashDateId)).toHaveLength(1);
  });
});

describe("live hash", () => {
  async function running() {
    const context = await setupWithDates();
    const hashDateId = context.on("2026-11-03")._id;
    await context.opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: context.ana._id });
    await context.opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: context.ben._id });
    await context.opsApi.mutation(api.hashingLive.start, { hashDateId });
    return { ...context, hashDateId };
  }

  test("two people ticking at once keep both ticks", async () => {
    const { t, anaApi, benApi, hashDateId } = await running();
    await Promise.all([
      anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true }),
      benApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: OTHER_ITEM, done: true }),
    ]);
    const checks = await checksOf(t, hashDateId);
    expect(checks.map((check) => check.itemKey).sort()).toEqual([ITEM, OTHER_ITEM].sort());
    expect(new Set(checks.map((check) => check.byUserId)).size).toBe(2);
  });

  test("ticking is idempotent, per item and per area", async () => {
    const { t, anaApi, benApi, hashDateId } = await running();
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true });
    await benApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true });
    expect(await checksOf(t, hashDateId)).toHaveLength(1);

    const sharedKitOtherArea = "medium-packout:event-kit:event-kit-1";
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: sharedKitOtherArea, done: true });
    expect(await checksOf(t, hashDateId)).toHaveLength(2);

    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: false });
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: false });
    expect(await checksOf(t, hashDateId)).toHaveLength(1);
  });

  test("refuses an item that isn't on this hash", async () => {
    const { anaApi, hashDateId } = await running();
    await expect(
      anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: "nope:nope:nope", done: true }),
    ).rejects.toThrow(/isn't on this hash/);
  });

  test("the live view counts ticks and flags against the seed", async () => {
    const { anaApi, hashDateId } = await running();
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true });
    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: OTHER_ITEM, reason: "low", note: "gaff" });
    await anaApi.mutation(api.hashingLive.setAreaClaim, { hashDateId, areaId: "large-packout", claimed: true });
    const live = await anaApi.query(api.hashingLive.get, { hashDateId, now: NOW });
    expect(live?.totals).toEqual({ total: 140, checked: 2, flagged: 1 });
    const area = live?.areas[0];
    expect(area).toMatchObject({ name: "Large Packout", total: 35, checked: 2, flagged: 1 });
    expect(area?.claims.map((claim) => claim.name)).toEqual(["Ana Crew"]);
    expect(area?.kits[0]?.rows[1]?.check).toMatchObject({ status: "flagged", flagReason: "low", note: "gaff" });
  });

  test("an added hash with areas shows only those areas and counts only them", async () => {
    const { opsApi } = await setupWithDates();
    const hashDateId = await opsApi.mutation(api.hashingSchedule.addDate, {
      quarterId: QUARTER,
      dateKey: "2026-11-02",
      startTime: "10:00",
      capacity: 2,
      areaIds: ["red-shelf"],
    });
    await opsApi.mutation(api.hashingLive.start, { hashDateId });
    const live = await opsApi.query(api.hashingLive.get, { hashDateId, now: NOW });
    expect(live?.areas.map((area) => area.name)).toEqual(["Red shelf"]);
    expect(live?.totals.total).toBe(18);
    await expect(
      opsApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true }),
    ).rejects.toThrow(/isn't on this hash/);
  });

  test("finishing credits everyone booked, even with items left", async () => {
    const { t, anaApi, benApi, hashDateId } = await running();
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true });
    await benApi.mutation(api.hashingLive.finish, { hashDateId });
    expect(await getDate(t, hashDateId)).toMatchObject({
      status: "finished",
      finalCounts: { total: 140, checked: 1, flagged: 0 },
    });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("done");
    expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("done");
    await expect(
      anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: OTHER_ITEM, done: true }),
    ).rejects.toThrow(/isn't running/);
  });

  test("someone who never confirmed a moved hash gets no credit unless they showed up", async () => {
    const { t, opsApi, anaApi, benApi, ana, ben, on } = await setupWithDates();
    const hashDateId = on("2026-11-03")._id;
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ben._id });
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("hashBookings").collect()) {
        await ctx.db.patch(row._id, { status: "needs_confirmation" });
      }
    });
    await opsApi.mutation(api.hashingLive.start, { hashDateId });
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: true });
    await opsApi.mutation(api.hashingLive.finish, { hashDateId });
    expect((await anaApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("done");
    expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");

    await expect(benApi.mutation(api.hashing.confirmBooking, { hashDateId })).rejects.toThrow();
    expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("needs_hash");

    await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId: on("2026-11-10")._id, userId: ben._id });
    expect((await benApi.query(api.hashing.getMine, { now: NOW }))?.state).toBe("booked");
  });

  test("a publish changes the next hash, never a started one", async () => {
    const { opsApi, on, hashDateId } = await running();
    const { version, tree } = await opsApi.query(api.hashingChecklist.getCurrent, {});
    const edited = { ...tree, areas: tree.areas.filter((area) => area.id !== "red-shelf") };
    edited.kits = edited.kits.filter((kit) => kit.id !== "red-shelf");
    await opsApi.mutation(api.hashingChecklist.publish, { baseVersion: version, ...edited });

    const pinned = await opsApi.query(api.hashingLive.get, { hashDateId, now: NOW });
    expect(pinned?.totals.total).toBe(140);

    const next = on("2026-11-10")._id;
    await opsApi.mutation(api.hashingLive.start, { hashDateId: next });
    expect((await opsApi.query(api.hashingLive.get, { hashDateId: next, now: NOW }))?.totals.total).toBe(122);
  });

  test("publish refuses a bad tree, and a stale draft", async () => {
    const { opsApi } = await setupWithDates();
    await expect(
      opsApi.mutation(api.hashingChecklist.publish, { baseVersion: 1, kits: [], areas: [] }),
    ).rejects.toThrow(/at least one area/);
    const { tree } = await opsApi.query(api.hashingChecklist.getCurrent, {});
    await opsApi.mutation(api.hashingChecklist.publish, { baseVersion: 1, ...tree });
    await expect(opsApi.mutation(api.hashingChecklist.publish, { baseVersion: 1, ...tree })).rejects.toThrow(
      /published version 2 first/,
    );
  });

  test("flags stay open in History until resolved", async () => {
    const { t, opsApi, anaApi, hashDateId } = await running();
    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "missing", note: "Gone" });
    await opsApi.mutation(api.hashingLive.finish, { hashDateId });

    const history = await opsApi.query(api.hashingLive.getHistory, {});
    expect(history.finished[0]?.people.sort()).toEqual(["Ana Crew", "Ben Crew"]);
    expect(history.flags).toMatchObject([
      { areaName: "Large Packout", text: "Container is clean and usable", reason: "missing", note: "Gone" },
    ]);
    expect((await opsApi.query(api.hashing.getOverview, { now: NOW })).openFlags).toBe(1);

    await expect(
      anaApi.mutation(api.hashingLive.resolveFlag, { checkId: history.flags[0]!._id }),
    ).rejects.toThrow(/access/i);
    await opsApi.mutation(api.hashingLive.resolveFlag, { checkId: history.flags[0]!._id });
    expect((await opsApi.query(api.hashingLive.getHistory, {})).flags).toEqual([]);
    expect((await checksOf(t, hashDateId))[0]?.resolvedBy).toBeDefined();
  });

  test("flagging a resolved item opens it again, and resolved flags can't be removed", async () => {
    const { opsApi, anaApi, hashDateId } = await running();
    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "missing" });
    const [flag] = (await opsApi.query(api.hashingLive.getHistory, {})).flags;
    await opsApi.mutation(api.hashingLive.resolveFlag, { checkId: flag!._id });
    await expect(anaApi.mutation(api.hashingLive.removeFlag, { hashDateId, itemKey: ITEM })).rejects.toThrow(/with ops/);

    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "low" });
    expect((await opsApi.query(api.hashingLive.getHistory, {})).flags).toHaveLength(1);
    await anaApi.mutation(api.hashingLive.removeFlag, { hashDateId, itemKey: ITEM });
    expect((await opsApi.query(api.hashingLive.getHistory, {})).flags).toEqual([]);
  });

  test("unticking never removes a flag", async () => {
    const { t, anaApi, hashDateId } = await running();
    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "missing" });
    await anaApi.mutation(api.hashingLive.setCheck, { hashDateId, itemKey: ITEM, done: false });
    expect(await checksOf(t, hashDateId)).toMatchObject([{ status: "flagged" }]);
  });

  test("a damaged flag can file a real damage report, once", async () => {
    const { t, anaApi, hashDateId } = await running();
    const inventoryItemId = await t.run(async (ctx) => {
      const typeId = await ctx.db.insert("inventoryTypes", {
        name: "SM58",
        category: "sound",
        model: "SM58",
        manualUrls: [],
        capabilities: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      return await ctx.db.insert("inventoryItems", { typeId, assetId: "A1", createdAt: NOW, updatedAt: NOW });
    });
    const damage = { inventoryItemId, operability: "needs_repair" as const, severity: 3 };
    await expect(
      anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "missing", damage }),
    ).rejects.toThrow(/Only damaged items/);

    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "damaged", note: "Cracked", damage });
    await anaApi.mutation(api.hashingLive.flagItem, { hashDateId, itemKey: ITEM, reason: "damaged", note: "Worse", damage });
    const reports = await t.run(async (ctx) => ctx.db.query("damageReports").collect());
    expect(reports).toHaveLength(1);
    expect(reports[0]?.notes).toBe("Hashing, Large Packout: Container is clean and usable\nCracked");
    expect((await checksOf(t, hashDateId))[0]?.damageReportId).toBe(reports[0]?._id);
    await expect(anaApi.mutation(api.hashingLive.removeFlag, { hashDateId, itemKey: ITEM })).rejects.toThrow(/with ops/);
  });
});
