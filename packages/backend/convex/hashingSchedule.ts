import {
  addDaysToDateKey,
  formatDateKeyRange,
  pacificDateKey,
  quarterWeek,
  stanfordNoClassDay,
  type AcademicQuarter,
} from "@arbor/format";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getUserAdminProfile, getUserId, requireAdminOrOperations } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  fillFromAvailability,
  flattenChecklist,
  followingHashingQuarter,
  hashingQuarterById,
  hashingQuarterFor,
  HASHING_DEFAULTS,
  planRegularDates,
} from "./lib/hashing";
import { HASHING_CHECKLIST_SEED } from "./lib/hashingChecklistSeed";
import {
  ensureChecklist,
  hashDateLabel,
  hashTimes,
  isHashCrew,
  latestChecklist,
  loadDateAvailability,
  loadDateBookings,
  loadHashDate,
  loadQuarterDates,
  loadQuarterPicture,
  loadSettings,
  loadStanding,
  loadUserBookings,
  notifyHash,
  requireFuture,
} from "./lib/hashingData";
import { hashDateOriginValue, hashDateStatusValue, hashBookingStatusValue } from "./lib/hashingValues";
import { quarterRefValue, settingsValue } from "./hashing";

const LOCATION_MAX = 80;
const REASON_MAX = 500;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateSettings(args: {
  weekday: number;
  startTime: string;
  durationMinutes: number;
  spotsPerHash: number;
  location: string;
}) {
  if (!Number.isInteger(args.weekday) || args.weekday < 0 || args.weekday > 6) {
    appError("HASH_INVALID_WEEKDAY", `Weekday must be 0–6, got ${args.weekday}.`);
  }
  if (!HH_MM.test(args.startTime)) appError("HASH_INVALID_TIME", `Start must be HH:mm, got ${args.startTime}.`);
  if (!Number.isInteger(args.durationMinutes) || args.durationMinutes < 15 || args.durationMinutes > 480) {
    appError("HASH_INVALID_LENGTH", `Length must be 15–480 minutes, got ${args.durationMinutes}.`);
  }
  validateCapacity(args.spotsPerHash);
  const location = args.location.trim();
  if (!location || location.length > LOCATION_MAX) {
    appError("HASH_INVALID_LOCATION", `Where must be 1–${LOCATION_MAX} characters.`);
  }
  return { ...args, location };
}

function validateCapacity(capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
    appError("HASH_INVALID_CAPACITY", `People must be 1–50, got ${capacity}.`);
  }
}

function requireQuarter(quarterId: string) {
  const quarter = hashingQuarterById(quarterId);
  if (!quarter) appError("HASH_UNKNOWN_QUARTER", `Unknown quarter: ${quarterId}.`);
  return quarter;
}

/** A hash belongs to the quarter it's in: first day of classes through the break after finals. */
function requireDateInQuarter(dateKey: string, quarter: AcademicQuarter) {
  if (dateKey < quarter.startDate || dateKey > quarter.reportingEndDate) {
    appError(
      "HASH_OUTSIDE_QUARTER",
      `Pick a date in ${quarter.label} (${formatDateKeyRange(quarter.startDate, quarter.reportingEndDate)}).`,
    );
  }
}

async function requireManager(ctx: QueryCtx | MutationCtx) {
  const user = await requireAdminOrOperations(ctx);
  return { user, userId: getUserId(user) };
}

async function clearAvailability(ctx: MutationCtx, hashDateId: Id<"hashDates">) {
  for (const answer of await loadDateAvailability(ctx, hashDateId)) await ctx.db.delete(answer._id);
}

/** Everyone booked has to re-confirm, and their old answers no longer apply. */
async function markDateMoved(ctx: MutationCtx, row: Doc<"hashDates">, location: string | undefined) {
  await clearAvailability(ctx, row._id);
  for (const booking of await loadDateBookings(ctx, row._id)) {
    await ctx.db.patch(booking._id, { status: "needs_confirmation" });
    await notifyHash(ctx, { userId: booking.userId, notice: "moved", row, location });
  }
}

/** Bookings end, and those people go back to needing a hash. */
async function releaseBookings(ctx: MutationCtx, row: Doc<"hashDates">, location: string | undefined) {
  for (const booking of await loadDateBookings(ctx, row._id)) {
    await ctx.db.delete(booking._id);
    await notifyHash(ctx, { userId: booking.userId, notice: "unbooked", row, location });
  }
}

async function deleteDate(ctx: MutationCtx, row: Doc<"hashDates">, location: string | undefined) {
  await releaseBookings(ctx, row, location);
  await clearAvailability(ctx, row._id);
  await ctx.db.delete(row._id);
}

/**
 * Make a quarter's dates match the setup. Safe to repeat: with nothing changed
 * it writes nothing, and only regular, unmoved, unstarted dates ever follow it.
 */
async function applySetup(
  ctx: MutationCtx,
  settings: Pick<Doc<"hashingSettings">, "weekday" | "startTime" | "durationMinutes" | "spotsPerHash" | "location">,
  quarter: AcademicQuarter,
  now: number,
) {
  const today = pacificDateKey(now);
  const todayIsOver = hashTimes(today, settings.startTime, settings.durationMinutes).startsAt <= now;
  const earliest = todayIsOver ? addDaysToDateKey(today, 1) : today;
  const dates = await loadQuarterDates(ctx, quarter.id);
  const regular = dates.filter((row) => row.origin === "regular");
  const isShiftable = (row: Doc<"hashDates">) =>
    !row.movedFromDateKey && row.startsAt > now && (row.status === "scheduled" || row.status === "off");

  const plan = planRegularDates({
    existing: regular.map((row) => ({
      id: row._id,
      dateKey: row.dateKey,
      movedFromDateKey: row.movedFromDateKey,
      shiftable: isShiftable(row),
    })),
    weekday: settings.weekday,
    fromKey: earliest > quarter.startDate ? earliest : quarter.startDate,
    toKey: quarter.finalsEndDate,
  });

  const dropped = new Set(plan.drop);
  const shiftTo = new Map(plan.shift.map(({ id, dateKey }) => [id, dateKey]));
  for (const row of regular) {
    if (dropped.has(row._id)) await deleteDate(ctx, row, settings.location);
    if (dropped.has(row._id) || !isShiftable(row)) continue;
    const dateKey = shiftTo.get(row._id) ?? row.dateKey;
    const times = hashTimes(dateKey, settings.startTime, settings.durationMinutes);
    const moved = times.startsAt !== row.startsAt;
    if (!moved && times.endsAt === row.endsAt && row.capacity === settings.spotsPerHash) continue;
    const patch = { ...times, dateKey, capacity: settings.spotsPerHash };
    await ctx.db.patch(row._id, patch);
    if (moved) await markDateMoved(ctx, { ...row, ...patch }, settings.location);
  }
  for (const { dateKey, off } of plan.create) {
    await ctx.db.insert("hashDates", {
      quarterId: quarter.id,
      dateKey,
      ...hashTimes(dateKey, settings.startTime, settings.durationMinutes),
      capacity: settings.spotsPerHash,
      origin: "regular",
      status: off ? "off" : "scheduled",
    });
  }
}

const setupRowValue = v.object({
  _id: v.id("hashDates"),
  dateKey: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  capacity: v.number(),
  filled: v.number(),
  origin: hashDateOriginValue,
  status: hashDateStatusValue,
  movedFromDateKey: v.optional(v.string()),
  areaIds: v.optional(v.array(v.string())),
  weekLabel: v.optional(v.string()),
  dayNote: v.optional(v.string()),
});

/** Ahead of today, plus anything mid-hash. Past dates live in History. */
async function setupRows(ctx: QueryCtx, quarterId: string, today: string) {
  const dates = await loadQuarterDates(ctx, quarterId);
  const ahead = dates.filter((row) => row.dateKey >= today && row.status !== "finished");
  return await Promise.all(
    ahead.map(async (row) => {
      const note = stanfordNoClassDay(row.dateKey);
      return {
        _id: row._id,
        dateKey: row.dateKey,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        capacity: row.capacity,
        filled: (await loadDateBookings(ctx, row._id)).length,
        origin: row.origin,
        status: row.status,
        movedFromDateKey: row.movedFromDateKey,
        areaIds: row.areaIds,
        weekLabel: quarterWeek(row.dateKey)?.label,
        dayNote: note?.kind === "holiday" ? note.label : undefined,
      };
    }),
  );
}

export const getSetup = query({
  args: { now: v.number() },
  returns: v.object({
    saved: v.boolean(),
    settings: settingsValue,
    quarter: v.union(quarterRefValue, v.null()),
    nextQuarter: v.union(quarterRefValue, v.null()),
    dates: v.array(setupRowValue),
    nextDates: v.array(setupRowValue),
    areas: v.array(v.object({ id: v.string(), name: v.string() })),
  }),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const today = pacificDateKey(args.now);
    const quarter = hashingQuarterFor(today);
    const next = quarter ? followingHashingQuarter(quarter) : null;
    const [saved, checklist] = await Promise.all([loadSettings(ctx), latestChecklist(ctx)]);
    const { weekday, startTime, durationMinutes, spotsPerHash, location } = saved ?? HASHING_DEFAULTS;
    const ref = (row: AcademicQuarter | null) => (row ? { id: row.id, label: row.label } : null);
    return {
      saved: saved !== null,
      settings: { weekday, startTime, durationMinutes, spotsPerHash, location },
      quarter: ref(quarter),
      nextQuarter: ref(next),
      dates: quarter ? await setupRows(ctx, quarter.id, today) : [],
      nextDates: next ? await setupRows(ctx, next.id, today) : [],
      areas: (checklist ?? HASHING_CHECKLIST_SEED).areas.map(({ id, name }) => ({ id, name })),
    };
  },
});

export const saveSetup = mutation({
  args: {
    weekday: v.number(),
    startTime: v.string(),
    durationMinutes: v.number(),
    spotsPerHash: v.number(),
    location: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireManager(ctx);
    const settings = validateSettings(args);
    const now = Date.now();
    await ensureChecklist(ctx);
    const existing = await loadSettings(ctx);
    if (existing) await ctx.db.patch(existing._id, { ...settings, updatedAt: now, updatedBy: userId });
    else await ctx.db.insert("hashingSettings", { ...settings, updatedAt: now, updatedBy: userId });

    const quarter = hashingQuarterFor(pacificDateKey(now));
    if (quarter) await applySetup(ctx, settings, quarter, now);
    return null;
  },
});

/** Build a quarter's dates from the saved setup: the next quarter, ahead of time. */
export const buildQuarter = mutation({
  args: { quarterId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const quarter = requireQuarter(args.quarterId);
    const settings = await loadSettings(ctx);
    if (!settings) appError("HASH_NO_SETUP", "Save the setup first.");
    await applySetup(ctx, settings, quarter, Date.now());
    return null;
  },
});

export const moveDate = mutation({
  args: { hashDateId: v.id("hashDates"), dateKey: v.string(), startTime: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    const now = Date.now();
    requireFuture(row, now);
    if (!HH_MM.test(args.startTime)) appError("HASH_INVALID_TIME", `Start must be HH:mm, got ${args.startTime}.`);
    requireDateInQuarter(args.dateKey, requireQuarter(row.quarterId));
    const durationMinutes = Math.round((row.endsAt - row.startsAt) / 60_000);
    const times = hashTimes(args.dateKey, args.startTime, durationMinutes);
    if (times.startsAt <= now) appError("HASH_IN_PAST", "Move it to a time that hasn't passed.");
    if (times.startsAt === row.startsAt) return null;

    const patch = {
      ...times,
      dateKey: args.dateKey,
      // Moved dates are live even in an off week: moving one is a deliberate choice.
      status: "scheduled" as const,
      movedFromDateKey: row.movedFromDateKey ?? row.dateKey,
    };
    await ctx.db.patch(row._id, patch);
    const settings = await loadSettings(ctx);
    await markDateMoved(ctx, { ...row, ...patch }, settings?.location);
    return null;
  },
});

async function bookUser(ctx: MutationCtx, row: Doc<"hashDates">, userId: string, location: string | undefined) {
  await ctx.db.insert("hashBookings", { hashDateId: row._id, userId, status: "booked" });
  const answer = await ctx.db
    .query("hashAvailability")
    .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id).eq("userId", userId))
    .unique();
  if (answer?.answer === "cant") await ctx.db.delete(answer._id);
  await notifyHash(ctx, { userId, notice: "booked", row, location });
}

/** Crew only, one open spot per quarter, and the date has room. */
async function requireBookable(ctx: MutationCtx, row: Doc<"hashDates">, userId: string) {
  if (row.status !== "scheduled") appError("HASH_NOT_BOOKABLE", "This date can't take bookings.");
  if (row.startsAt <= Date.now()) appError("HASH_IN_PAST", "This hash is in the past.");
  if (!isHashCrew(await getUserAdminProfile(ctx, userId))) {
    appError("HASHING_CREW_ONLY", "Only active crew can be booked on a hash.");
  }
  const bookings = await loadDateBookings(ctx, row._id);
  if (bookings.length >= row.capacity) {
    appError("HASH_FULL", `${hashDateLabel(row)} is full (${bookings.length} of ${row.capacity}).`);
  }
  const mine = await loadUserBookings(ctx, userId);
  for (const booking of mine) {
    if (booking.hashDateId === row._id) appError("HASH_ALREADY_BOOKED", "They're already booked on this date.");
    const other = await ctx.db.get(booking.hashDateId);
    if (other?.quarterId === row.quarterId) {
      appError("HASH_ALREADY_BOOKED", `They're already on ${hashDateLabel(other)}. Unbook that first.`);
    }
  }
}

export const addDate = mutation({
  args: {
    quarterId: v.string(),
    dateKey: v.string(),
    startTime: v.string(),
    capacity: v.number(),
    bookUserIds: v.optional(v.array(v.string())),
    areaIds: v.optional(v.array(v.string())),
  },
  returns: v.id("hashDates"),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const quarter = requireQuarter(args.quarterId);
    requireDateInQuarter(args.dateKey, quarter);
    if (!HH_MM.test(args.startTime)) appError("HASH_INVALID_TIME", `Start must be HH:mm, got ${args.startTime}.`);
    validateCapacity(args.capacity);
    const settings = await loadSettings(ctx);
    if (!settings) appError("HASH_NO_SETUP", "Save the setup first.");
    const times = hashTimes(args.dateKey, args.startTime, settings.durationMinutes);
    if (times.startsAt <= Date.now()) appError("HASH_IN_PAST", "Pick a time that hasn't passed.");
    const bookUserIds = [...new Set(args.bookUserIds ?? [])];
    if (bookUserIds.length > args.capacity) {
      appError("HASH_FULL", `That's ${bookUserIds.length} people for ${args.capacity} spots.`);
    }
    const hashDateId = await ctx.db.insert("hashDates", {
      quarterId: quarter.id,
      dateKey: args.dateKey,
      ...times,
      capacity: args.capacity,
      origin: "added",
      status: "scheduled",
      areaIds: args.areaIds?.length ? args.areaIds : undefined,
    });
    const row = await loadHashDate(ctx, hashDateId);
    for (const userId of bookUserIds) {
      await requireBookable(ctx, row, userId);
      await bookUser(ctx, row, userId, settings.location);
    }
    return hashDateId;
  },
});

/** Off or on again. Turning a date off ends its bookings; answers stay for if it comes back. */
export const setDateOff = mutation({
  args: { hashDateId: v.id("hashDates"), off: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    requireFuture(row, Date.now());
    const status = args.off ? ("off" as const) : ("scheduled" as const);
    if (row.status === status) return null;
    await ctx.db.patch(row._id, { status });
    if (args.off) await releaseBookings(ctx, row, (await loadSettings(ctx))?.location);
    return null;
  },
});

export const removeDate = mutation({
  args: { hashDateId: v.id("hashDates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    if (row.origin !== "added") appError("HASH_NOT_ADDED", "Only added dates can be removed. Turn this one off.");
    requireFuture(row, Date.now());
    await deleteDate(ctx, row, (await loadSettings(ctx))?.location);
    return null;
  },
});

const cellValue = v.union(v.literal("can"), v.literal("cant"), hashBookingStatusValue, v.null());

/** Who still needs a spot, by how hard they are to place. */
function matrixRows(picture: Awaited<ReturnType<typeof loadQuarterPicture>>) {
  const { open, bookingsByDate, answersByDate, people } = picture;
  const cellByDate = open.map((row) => {
    const cells = new Map<string, "can" | "cant" | "booked" | "needs_confirmation">();
    for (const answer of answersByDate.get(row._id) ?? []) cells.set(answer.userId, answer.answer);
    for (const booking of bookingsByDate.get(row._id) ?? []) cells.set(booking.userId, booking.status);
    return cells;
  });
  return people
    .filter((person) => person.state === "needs_hash" || person.state === "booked")
    .map((person) => {
      const cells = cellByDate.map((cellsForDate) => cellsForDate.get(person.userId) ?? null);
      return {
        userId: person.userId,
        name: person.name,
        canCount: cells.filter((cell) => cell === "can").length,
        booked: person.state === "booked",
        cells,
      };
    })
    .sort(
      (a, b) =>
        Number(a.booked) - Number(b.booked) || a.canCount - b.canCount || a.name.localeCompare(b.name),
    );
}

export const getSchedule = query({
  args: { now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      quarter: quarterRefValue,
      hasDates: v.boolean(),
      summary: v.object({
        crew: v.number(),
        hashed: v.number(),
        booked: v.number(),
        needSpot: v.number(),
        spotsOpen: v.number(),
        exempt: v.number(),
      }),
      dates: v.array(
        v.object({
          _id: v.id("hashDates"),
          dateKey: v.string(),
          startsAt: v.number(),
          capacity: v.number(),
          filled: v.number(),
          origin: hashDateOriginValue,
        }),
      ),
      people: v.array(
        v.object({
          userId: v.string(),
          name: v.string(),
          canCount: v.number(),
          booked: v.boolean(),
          cells: v.array(cellValue),
        }),
      ),
      cantMakeAny: v.array(
        v.object({ userId: v.string(), name: v.string(), reason: v.string(), suggestedTimes: v.string() }),
      ),
      exempt: v.array(v.object({ userId: v.string(), name: v.string(), reason: v.string() })),
      /** Everyone a new date could book. */
      unbooked: v.array(v.object({ userId: v.string(), name: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const today = pacificDateKey(args.now);
    const quarter = hashingQuarterFor(today);
    if (!quarter) return null;

    const picture = await loadQuarterPicture(ctx, quarter.id, today);
    const { open, dates, bookingsByDate, people } = picture;
    const count = (state: (typeof people)[number]["state"]) =>
      people.filter((person) => person.state === state).length;
    const rows = open.map((row) => ({
      _id: row._id,
      dateKey: row.dateKey,
      startsAt: row.startsAt,
      capacity: row.capacity,
      filled: (bookingsByDate.get(row._id) ?? []).length,
      origin: row.origin,
    }));
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      quarter: { id: quarter.id, label: quarter.label },
      hasDates: dates.length > 0,
      summary: {
        crew: people.length,
        hashed: count("done"),
        booked: count("booked"),
        needSpot: count("needs_hash") + count("no_dates_work"),
        spotsOpen: rows.reduce((sum, row) => sum + Math.max(0, row.capacity - row.filled), 0),
        exempt: count("exempt"),
      },
      dates: rows,
      people: matrixRows(picture),
      cantMakeAny: people
        .flatMap((person) =>
          person.state === "no_dates_work" && person.standing?.kind === "no_dates_work"
            ? [
                {
                  userId: person.userId,
                  name: person.name,
                  reason: person.standing.reason,
                  suggestedTimes: person.standing.suggestedTimes,
                },
              ]
            : [],
        )
        .sort(byName),
      exempt: people
        .flatMap((person) =>
          person.standing?.kind === "exempt"
            ? [{ userId: person.userId, name: person.name, reason: person.standing.reason }]
            : [],
        )
        .sort(byName),
      unbooked: people
        .filter((person) => person.state === "needs_hash" || person.state === "no_dates_work")
        .map(({ userId, name }) => ({ userId, name }))
        .sort(byName),
    };
  },
});

export const bookPerson = mutation({
  args: { hashDateId: v.id("hashDates"), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    await requireBookable(ctx, row, args.userId);
    await bookUser(ctx, row, args.userId, (await loadSettings(ctx))?.location);
    return null;
  },
});

export const unbookPerson = mutation({
  args: { hashDateId: v.id("hashDates"), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    requireFuture(row, Date.now());
    const booking = await ctx.db
      .query("hashBookings")
      .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id).eq("userId", args.userId))
      .unique();
    if (!booking) return null;
    await ctx.db.delete(booking._id);
    await notifyHash(ctx, {
      userId: args.userId,
      notice: "unbooked",
      row,
      location: (await loadSettings(ctx))?.location,
    });
    return null;
  },
});

function planFill(picture: Awaited<ReturnType<typeof loadQuarterPicture>>) {
  const { open, bookingsByDate, answersByDate, people } = picture;
  const needing = people.filter((person) => person.state === "needs_hash");
  const needingIds = new Set(needing.map((person) => person.userId));
  return fillFromAvailability({
    people: needing.map((person) => person.userId),
    dates: open.map((row) => ({
      id: row._id as string,
      openSpots: row.capacity - (bookingsByDate.get(row._id) ?? []).length,
    })),
    canAnswers: open.flatMap((row) =>
      (answersByDate.get(row._id) ?? [])
        .filter((answer) => answer.answer === "can" && needingIds.has(answer.userId))
        .map((answer) => ({ userId: answer.userId, dateId: row._id as string })),
    ),
  });
}

/** What "Fill from availability" would do, for the confirm dialog. */
export const previewFill = query({
  args: { now: v.number() },
  returns: v.object({
    placements: v.array(v.object({ name: v.string(), startsAt: v.number() })),
    unplaced: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const today = pacificDateKey(args.now);
    const quarter = hashingQuarterFor(today);
    if (!quarter) return { placements: [], unplaced: [] };
    const picture = await loadQuarterPicture(ctx, quarter.id, today);
    const plan = planFill(picture);
    const nameOf = new Map(picture.people.map((person) => [person.userId, person.name]));
    const rowById = new Map<string, Doc<"hashDates">>(picture.open.map((row) => [row._id, row]));
    return {
      placements: plan.placements
        .map(({ userId, dateId }) => ({ name: nameOf.get(userId) ?? "Crew", startsAt: rowById.get(dateId)!.startsAt }))
        .sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name)),
      unplaced: plan.unplaced.map((userId) => nameOf.get(userId) ?? "Crew").sort(),
    };
  },
});

export const applyFill = mutation({
  args: {},
  returns: v.object({ booked: v.number() }),
  handler: async (ctx) => {
    await requireManager(ctx);
    const now = Date.now();
    const today = pacificDateKey(now);
    const quarter = hashingQuarterFor(today);
    if (!quarter) return { booked: 0 };
    const picture = await loadQuarterPicture(ctx, quarter.id, today);
    const plan = planFill(picture);
    const rowById = new Map<string, Doc<"hashDates">>(picture.open.map((row) => [row._id, row]));
    const location = (await loadSettings(ctx))?.location;
    for (const { userId, dateId } of plan.placements) {
      await bookUser(ctx, rowById.get(dateId)!, userId, location);
    }
    return { booked: plan.placements.length };
  },
});

export const exemptPerson = mutation({
  args: { userId: v.string(), quarterId: v.string(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId: exemptedBy } = await requireManager(ctx);
    requireQuarter(args.quarterId);
    const reason = args.reason.trim();
    if (!reason) appError("HASH_REASON_REQUIRED", "Give a reason for the exemption.");
    if (reason.length > REASON_MAX) appError("HASH_TEXT_TOO_LONG", `Keep the reason under ${REASON_MAX} characters.`);
    const standing = { kind: "exempt" as const, reason, exemptedBy };
    const existing = await loadStanding(ctx, args.userId, args.quarterId);
    if (existing) await ctx.db.patch(existing._id, { standing });
    else await ctx.db.insert("hashQuarterStanding", { userId: args.userId, quarterId: args.quarterId, standing });
    return null;
  },
});

export const clearExemption = mutation({
  args: { userId: v.string(), quarterId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    const existing = await loadStanding(ctx, args.userId, args.quarterId);
    if (existing?.standing.kind === "exempt") await ctx.db.delete(existing._id);
    return null;
  },
});

