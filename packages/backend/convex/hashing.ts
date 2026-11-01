import { pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { findAuthUsersByIds, requireAdminOrOperations } from "./lib/auth";
import { appError } from "./lib/errors";
import { deriveQuarterState, hashingQuarterById, hashingQuarterFor, isLapsed } from "./lib/hashing";
import { isHashEvent } from "./lib/hashEvent";
import {
  loadDateBookings,
  loadDateForEvent,
  loadHashDate,
  loadQuarterDates,
  loadSettings,
  loadStanding,
  loadUserBookings,
  requireFuture,
  requireHashCrew,
  requireHashEventId,
  requireHashingViewer,
} from "./lib/hashingData";
import { clearHashShifts } from "./lib/hashingEvents";
import {
  hashAnswerValue,
  hashBookingStatusValue,
  hashDateOriginValue,
  hashDateStatusValue,
  hashStandingValue,
} from "./lib/hashingValues";
import { normalizeEventStatus } from "./lib/eventStatus";

/** Reason and suggested times on "None of these work". */
const STANDING_TEXT_MAX = 500;
/** A person's shifts across the rest of a quarter. */
const SHIFT_TAKE = 200;
/** Open flags are a tab badge: it stops counting at this many. */
const OPEN_FLAG_TAKE = 100;
/** A hash this long past its end has been forgotten, not run late. */
const STALE_AFTER_MS = 86_400_000;
/** A hash a week, oldest first, so a few quarters of forgetting still fit. */
const RUNNING_TAKE = 50;

export const quarterRefValue = v.object({ id: v.string(), label: v.string() });

export const settingsValue = v.object({
  weekday: v.number(),
  startTime: v.string(),
  durationMinutes: v.number(),
  spotsPerHash: v.number(),
  location: v.string(),
});

function pickSettings(settings: Doc<"hashingSettings">) {
  const { weekday, startTime, durationMinutes, spotsPerHash, location } = settings;
  return { weekday, startTime, durationMinutes, spotsPerHash, location };
}

async function countOpenFlags(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("hashChecks")
    .withIndex("by_status_and_resolvedAt", (q) => q.eq("status", "flagged").eq("resolvedAt", undefined))
    .take(OPEN_FLAG_TAKE);
  return rows.length;
}

/** Started and never finished. Nothing closes these on its own, so ops have to see them. */
async function loadStaleHashes(ctx: QueryCtx, now: number) {
  const running = await ctx.db
    .query("hashDates")
    .withIndex("by_status_and_dateKey", (q) => q.eq("status", "in_progress"))
    .take(RUNNING_TAKE);
  return running
    .filter((row) => row.endsAt + STALE_AFTER_MS < now)
    .map(({ _id, dateKey, startsAt }) => ({ _id, dateKey, startsAt }));
}

/** The hashing header: this quarter, the slot, the tab badges and any forgotten hash. */
export const getOverview = query({
  args: { now: v.number() },
  returns: v.object({
    quarter: v.union(quarterRefValue, v.null()),
    settings: v.union(settingsValue, v.null()),
    canManage: v.boolean(),
    openFlags: v.number(),
    staleHashes: v.array(v.object({ _id: v.id("hashDates"), dateKey: v.string(), startsAt: v.number() })),
  }),
  handler: async (ctx, args) => {
    const viewer = await requireHashingViewer(ctx);
    const quarter = hashingQuarterFor(pacificDateKey(args.now));
    const settings = await loadSettings(ctx);
    return {
      quarter: quarter ? { id: quarter.id, label: quarter.label } : null,
      settings: settings ? pickSettings(settings) : null,
      canManage: viewer.canManage,
      openFlags: viewer.canManage ? await countOpenFlags(ctx) : 0,
      staleHashes: viewer.canManage ? await loadStaleHashes(ctx, args.now) : [],
    };
  },
});

async function loadMyQuarterBookings(ctx: QueryCtx, userId: string, dates: Doc<"hashDates">[], today: string) {
  return await loadUserBookings(ctx, userId, dates.filter((row) => !isLapsed(row, today)));
}

/** Other work the person is on, per Pacific day, across `dates`. A hash isn't a clash with itself. */
async function loadMyEventDays(ctx: QueryCtx, userId: string, dates: Doc<"hashDates">[]) {
  const titles = new Map<string, string>();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return titles;
  const wanted = new Set(dates.map((row) => row.dateKey));
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q
        .eq("userId", userId)
        .gte("startsAt", first.startsAt - 86_400_000)
        .lte("startsAt", last.endsAt + 86_400_000),
    )
    .take(SHIFT_TAKE);
  const onDay = shifts.filter((shift) => wanted.has(pacificDateKey(shift.startsAt)));
  const events = await Promise.all([...new Set(onDay.map((shift) => shift.eventId))].map((id) => ctx.db.get(id)));
  const eventById = new Map(events.flatMap((event) => (event ? [[event._id, event] as const] : [])));
  for (const shift of onDay) {
    const event = eventById.get(shift.eventId);
    if (!event || isHashEvent(event) || normalizeEventStatus(event.status) === "cancelled") continue;
    titles.set(pacificDateKey(shift.startsAt), event.title);
  }
  return titles;
}

export const getMine = query({
  args: { now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      quarter: quarterRefValue,
      isCrew: v.boolean(),
      state: v.union(
        v.literal("done"),
        v.literal("exempt"),
        v.literal("booked"),
        v.literal("no_dates_work"),
        v.literal("needs_hash"),
      ),
      standing: v.optional(hashStandingValue),
      doneAt: v.optional(v.number()),
      dates: v.array(
        v.object({
          _id: v.id("hashDates"),
          dateKey: v.string(),
          startsAt: v.number(),
          endsAt: v.number(),
          capacity: v.number(),
          filled: v.number(),
          origin: hashDateOriginValue,
          inProgress: v.boolean(),
          /** Who's on it: for a full date, or one you're on yourself. */
          names: v.array(v.string()),
          answer: v.optional(hashAnswerValue),
          booking: v.optional(hashBookingStatusValue),
          eventTitle: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await requireHashingViewer(ctx);
    const today = pacificDateKey(args.now);
    const quarter = hashingQuarterFor(today);
    if (!quarter) return null;

    const [dates, standingRow] = await Promise.all([
      loadQuarterDates(ctx, quarter.id),
      loadStanding(ctx, viewer.userId, quarter.id),
    ]);
    const mine = await loadMyQuarterBookings(ctx, viewer.userId, dates, today);
    const standing = standingRow?.standing;
    const state = deriveQuarterState({
      bookings: mine.map(({ booking, row }) => ({ status: booking.status, hashStatus: row.status })),
      standing: standing?.kind,
    });
    const myBookingByDate = new Map(mine.map(({ booking, row }) => [row._id, booking]));

    const upcoming = dates.filter(
      (row) => row.status === "in_progress" || (row.status === "scheduled" && row.dateKey >= today),
    );
    const [bookingLists, answers, eventDays] = await Promise.all([
      Promise.all(upcoming.map((row) => loadDateBookings(ctx, row))),
      Promise.all(
        upcoming.map((row) =>
          ctx.db
            .query("hashAvailability")
            .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id).eq("userId", viewer.userId))
            .unique(),
        ),
      ),
      loadMyEventDays(ctx, viewer.userId, upcoming),
    ]);
    const shownUserIds = upcoming.flatMap((row, index) => {
      const bookings = bookingLists[index] ?? [];
      const visible = bookings.length >= row.capacity || myBookingByDate.has(row._id);
      return visible ? bookings.map((booking) => booking.userId) : [];
    });
    const userByKey = await findAuthUsersByIds(ctx, shownUserIds);

    const done = mine
      .filter(({ booking, row }) => booking.status === "booked" && row.status === "finished")
      .map(({ row }) => row.startsAt);

    return {
      quarter: { id: quarter.id, label: quarter.label },
      isCrew: viewer.isCrew,
      state,
      standing,
      doneAt: done.length ? Math.min(...done) : undefined,
      dates: upcoming.map((row, index) => {
        const bookings = bookingLists[index] ?? [];
        const visible = bookings.length >= row.capacity || myBookingByDate.has(row._id);
        return {
          _id: row._id,
          dateKey: row.dateKey,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          capacity: row.capacity,
          filled: bookings.length,
          origin: row.origin,
          inProgress: row.status === "in_progress",
          names: visible
            ? bookings.map((booking) => {
                const user = userByKey.get(booking.userId);
                return user?.name || user?.email || "Crew";
              })
            : [],
          answer: answers[index]?.answer,
          booking: myBookingByDate.get(row._id)?.status,
          eventTitle: eventDays.get(row.dateKey),
        };
      }),
    };
  },
});

/** The Home widget's data: null unless this person has something to do. */
export const getMyPrompt = query({
  args: { now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      quarterLabel: v.string(),
      toConfirm: v.array(
        v.object({ hashDateId: v.id("hashDates"), dateKey: v.string(), startsAt: v.number(), endsAt: v.number() }),
      ),
      toAnswer: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await requireHashingViewer(ctx);
    if (!viewer.isCrew) return null;
    const today = pacificDateKey(args.now);
    const quarter = hashingQuarterFor(today);
    if (!quarter) return null;

    const dates = await loadQuarterDates(ctx, quarter.id);
    const [mine, standingRow] = await Promise.all([
      loadMyQuarterBookings(ctx, viewer.userId, dates, today),
      loadStanding(ctx, viewer.userId, quarter.id),
    ]);
    const state = deriveQuarterState({
      bookings: mine.map(({ booking, row }) => ({ status: booking.status, hashStatus: row.status })),
      standing: standingRow?.standing.kind,
    });
    const toConfirm = mine
      .filter(({ booking, row }) => booking.status === "needs_confirmation" && row.status === "scheduled")
      .map(({ row }) => ({ hashDateId: row._id, dateKey: row.dateKey, startsAt: row.startsAt, endsAt: row.endsAt }))
      .sort((a, b) => a.startsAt - b.startsAt);

    let toAnswer = 0;
    if (state === "needs_hash") {
      const upcoming = dates.filter((row) => row.status === "scheduled" && row.startsAt > args.now);
      const answers = await Promise.all(
        upcoming.map((row) =>
          ctx.db
            .query("hashAvailability")
            .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id).eq("userId", viewer.userId))
            .unique(),
        ),
      );
      toAnswer = answers.filter((answer) => !answer).length;
    }
    if (toConfirm.length === 0 && toAnswer === 0) return null;
    return { quarterLabel: quarter.label, toConfirm, toAnswer };
  },
});

export const setAvailability = mutation({
  args: {
    hashDateId: v.id("hashDates"),
    /** `null` clears the answer. */
    answer: v.union(hashAnswerValue, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireHashCrew(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    requireFuture(row, Date.now());
    if (row.status === "off") appError("HASH_OFF", "This date is off.");

    const bookings = await loadDateBookings(ctx, row);
    if (bookings.some((booking) => booking.userId === userId)) {
      appError("HASH_ALREADY_BOOKED", "You're booked on this date. Give up your spot first.");
    }

    const existing = await ctx.db
      .query("hashAvailability")
      .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id).eq("userId", userId))
      .unique();
    if (args.answer === null) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, { answer: args.answer });
    } else {
      await ctx.db.insert("hashAvailability", { hashDateId: row._id, userId, answer: args.answer });
    }

    if (args.answer === "can") {
      const standing = await loadStanding(ctx, userId, row.quarterId);
      if (standing?.standing.kind === "no_dates_work") await ctx.db.delete(standing._id);
    }
    return null;
  },
});

async function loadMyBooking(ctx: QueryCtx, row: Doc<"hashDates">, userId: string) {
  const booking = (await loadDateBookings(ctx, row)).find((candidate) => candidate.userId === userId);
  if (!booking) appError("HASH_NOT_BOOKED", "You're not booked on this date.");
  return booking;
}

export const confirmBooking = mutation({
  args: { hashDateId: v.id("hashDates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireHashCrew(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    if (row.status === "finished") appError("HASH_ALREADY_FINISHED", "This hash has already finished.");
    const booking = await loadMyBooking(ctx, row, userId);
    for (const shiftId of booking.shiftIds) await ctx.db.patch(shiftId, { needsConfirmation: undefined });
    return null;
  },
});

/** "Can't make it" and giving up a spot: the spot opens and they need a hash again. */
export const giveUpSpot = mutation({
  args: { hashDateId: v.id("hashDates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireHashCrew(ctx);
    const row = await loadHashDate(ctx, args.hashDateId);
    requireFuture(row, Date.now());
    const booking = await loadMyBooking(ctx, row, userId);
    await clearHashShifts(ctx, requireHashEventId(row), (shift) => !booking.shiftIds.includes(shift._id));

    const answer = await ctx.db
      .query("hashAvailability")
      .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id).eq("userId", userId))
      .unique();
    if (answer) await ctx.db.patch(answer._id, { answer: "cant" });
    else await ctx.db.insert("hashAvailability", { hashDateId: row._id, userId, answer: "cant" });
    return null;
  },
});

/** "None of these work". Only ever writes `no_dates_work`: staff grant exemptions. */
export const saveNoDatesWork = mutation({
  args: { quarterId: v.string(), reason: v.string(), suggestedTimes: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireHashCrew(ctx);
    if (!hashingQuarterById(args.quarterId)) appError("HASH_UNKNOWN_QUARTER", `Unknown quarter: ${args.quarterId}.`);
    const reason = args.reason.trim();
    const suggestedTimes = args.suggestedTimes.trim();
    if (!reason) appError("HASH_REASON_REQUIRED", "Say why none of these dates work.");
    if (reason.length > STANDING_TEXT_MAX || suggestedTimes.length > STANDING_TEXT_MAX) {
      appError("HASH_TEXT_TOO_LONG", `Keep each answer under ${STANDING_TEXT_MAX} characters.`);
    }
    const existing = await loadStanding(ctx, userId, args.quarterId);
    if (existing?.standing.kind === "exempt") appError("HASH_EXEMPT", "You're already exempt this quarter.");
    const standing = { kind: "no_dates_work" as const, reason, suggestedTimes };
    if (existing) await ctx.db.patch(existing._id, { standing });
    else await ctx.db.insert("hashQuarterStanding", { userId, quarterId: args.quarterId, standing });
    return null;
  },
});

export const eventAddonValue = v.object({
  hashDateId: v.id("hashDates"),
  status: hashDateStatusValue,
  origin: hashDateOriginValue,
  filled: v.number(),
  capacity: v.number(),
});

/** The event workspace's Hashing card. */
export const getEventAddon = query({
  args: { eventId: v.id("events") },
  returns: v.union(eventAddonValue, v.null()),
  handler: async (ctx, args) => {
    await requireAdminOrOperations(ctx);
    const [event, row] = await Promise.all([ctx.db.get(args.eventId), loadDateForEvent(ctx, args.eventId)]);
    if (!event || !row || !isHashEvent(event)) return null;
    return {
      hashDateId: row._id,
      status: row.status,
      origin: row.origin,
      filled: (await loadDateBookings(ctx, row)).length,
      capacity: row.capacity,
    };
  },
});
