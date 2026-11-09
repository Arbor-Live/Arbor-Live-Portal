import { formatDateTime, pacificDateAndTimeToMs, pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  findAuthUsersByIds,
  getUserAdminProfile,
  getUserId,
  hasOperationsAccess,
  requireAuth,
  requireArborInternalContext,
} from "./auth";
import { appError } from "./errors";
import { isShiftFilled, isTraineeShift } from "./crewShiftKinds";
import { HASHING_CHECKLIST_SEED } from "./hashingChecklistSeed";
import { resolveParticipationFlags } from "./userParticipation";
import { loadAdminProfilesByStatus } from "./userProfiles";
import { resolveUserStatus } from "./userStatus";
import { hasVertical, isStaffMember, resolveProfileMembership } from "./userVerticals";
import { deriveQuarterState, holdsQuarterSpot, isLapsed, type HashQuarterState } from "./hashing";
import { HASH_ROLE, type HashBookingStatus, type HashStanding } from "./hashingValues";

/** Regular weeks plus added dates. A quarter is about 11 weeks. */
export const QUARTER_DATE_LIMIT = 60;
/** Far past any capacity; the live count stays exact up to here. */
const DATE_SHIFT_TAKE = 100;
/** One answer per crew member per date; the roster is a few hundred at most. */
const DATE_AVAILABILITY_TAKE = 1000;
/** Standings for one quarter: at most one per crew member. */
const QUARTER_STANDING_TAKE = 1000;
/** One person's shifts on any event across a quarter. Past a busy quarter's load. */
const USER_QUARTER_SHIFT_TAKE = 300;

type Ctx = QueryCtx | MutationCtx;
type Profile = Doc<"userAdminProfiles">;

/** Owes a hash: active people on the Crew vertical, whatever else they're on. */
export function isHashCrew(profile: Profile | null | undefined): profile is Profile {
  if (!profile) return false;
  if (resolveUserStatus(profile) !== "active") return false;
  if (!resolveParticipationFlags(profile).includeInTimecards) return false;
  return hasVertical(resolveProfileMembership(profile).verticals, "Crew");
}

/** The people `listCrewTimecardOverview` lists. Inactive crew stay on it, unlike `isHashCrew`. */
export function isOnTimecardOverview(profile: Profile | null | undefined) {
  if (!profile || resolveUserStatus(profile) === "alumni") return false;
  if (!resolveParticipationFlags(profile).includeInTimecards) return false;
  return isStaffMember(resolveProfileMembership(profile));
}

/** Any Arbor member, and whether they owe a hash and can run the schedule. */
export async function requireHashingViewer(ctx: Ctx) {
  const user = await requireAuth(ctx);
  await requireArborInternalContext(ctx);
  const userId = getUserId(user);
  const profile = await getUserAdminProfile(ctx, userId);
  return {
    user,
    userId,
    profile,
    isCrew: isHashCrew(profile),
    canManage: await hasOperationsAccess(ctx, user),
  };
}

/** The signed-in crew member, or an error saying why they can't answer. */
export async function requireHashCrew(ctx: Ctx) {
  const viewer = await requireHashingViewer(ctx);
  if (!viewer.isCrew) appError("HASHING_CREW_ONLY", "Hashing is limited to active crew.");
  return viewer;
}

export async function loadHashCrew(ctx: Ctx) {
  return (await loadAdminProfilesByStatus(ctx, ["active"])).filter(isHashCrew);
}

export async function loadHashDate(ctx: Ctx, hashDateId: Id<"hashDates">) {
  const row = await ctx.db.get(hashDateId);
  if (!row) appError("HASH_NOT_FOUND", "This hash no longer exists.");
  return row;
}

export async function loadQuarterDates(ctx: Ctx, quarterId: string) {
  return await ctx.db
    .query("hashDates")
    .withIndex("by_quarterId_and_dateKey", (q) => q.eq("quarterId", quarterId))
    .take(QUARTER_DATE_LIMIT);
}

export async function loadDateForEvent(ctx: Ctx, eventId: Id<"events">) {
  return await ctx.db
    .query("hashDates")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
}

export function requireHashEventId(row: Pick<Doc<"hashDates">, "eventId">) {
  if (!row.eventId) appError("HASH_NO_EVENT", "This date is off, so it has no event.");
  return row.eventId;
}

export type HashBooking = {
  userId: string;
  status: HashBookingStatus;
  shiftIds: Id<"eventCrewShifts">[];
};

/**
 * A booking is a person's `Hash` shift on the hash's event, and a crew edit on the
 * event page writes that role too. Two shifts for one person are one booking.
 * Trainees and open slots aren't bookings.
 */
function bookingsFromShifts(shifts: Doc<"eventCrewShifts">[]) {
  const byUser = new Map<string, HashBooking>();
  for (const shift of shifts) {
    if (shift.role !== HASH_ROLE || !isShiftFilled(shift) || isTraineeShift(shift)) continue;
    const userId = shift.userId!.trim();
    const booking = byUser.get(userId) ?? { userId, status: "booked" as HashBookingStatus, shiftIds: [] };
    booking.shiftIds.push(shift._id);
    if (shift.needsConfirmation) booking.status = "needs_confirmation";
    byUser.set(userId, booking);
  }
  return [...byUser.values()];
}

export async function loadDateBookings(ctx: Ctx, row: Pick<Doc<"hashDates">, "eventId">) {
  const { eventId } = row;
  if (!eventId) return [];
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(DATE_SHIFT_TAKE);
  return bookingsFromShifts(shifts);
}

export async function loadDateAvailability(ctx: Ctx, hashDateId: Id<"hashDates">) {
  return await ctx.db
    .query("hashAvailability")
    .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", hashDateId))
    .take(DATE_AVAILABILITY_TAKE);
}

/** This person's bookings among `dates` (soonest first, one quarter's worth). */
export async function loadUserBookings(ctx: Ctx, userId: string, dates: Doc<"hashDates">[]) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return [];
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q.eq("userId", userId).gte("startsAt", first.startsAt).lte("startsAt", last.startsAt),
    )
    .take(USER_QUARTER_SHIFT_TAKE);
  const rowByEvent = new Map(dates.flatMap((row) => (row.eventId ? [[row.eventId, row] as const] : [])));
  return [...rowByEvent].flatMap(([eventId, row]) =>
    bookingsFromShifts(shifts.filter((shift) => shift.eventId === eventId)).map((booking) => ({ booking, row })),
  );
}

export async function loadStanding(ctx: Ctx, userId: string, quarterId: string) {
  return await ctx.db
    .query("hashQuarterStanding")
    .withIndex("by_quarterId_and_userId", (q) => q.eq("quarterId", quarterId).eq("userId", userId))
    .unique();
}

/**
 * What makes a person bookable on a date, wherever the booking comes from.
 * `headcount` is how many the date would hold with them on it, and null means
 * the date has no limit here.
 */
export async function requireBookingRules(ctx: Ctx, row: Doc<"hashDates">, userId: string, headcount: number | null) {
  if (!isHashCrew(await getUserAdminProfile(ctx, userId))) {
    appError("HASHING_CREW_ONLY", "Only active crew can be booked on a hash.");
  }
  if (headcount !== null && headcount > row.capacity) {
    appError("HASH_FULL", `${hashDateLabel(row)} is full (${headcount - 1} of ${row.capacity}).`);
  }
  const mine = await loadUserBookings(ctx, userId, await loadQuarterDates(ctx, row.quarterId));
  for (const { booking, row: other } of mine) {
    if (other._id === row._id) appError("HASH_ALREADY_BOOKED", "They're already booked on this date.");
    if (holdsQuarterSpot(booking, other, pacificDateKey(Date.now()))) {
      appError("HASH_ALREADY_BOOKED", `They're already on ${hashDateLabel(other)}. Unbook that first.`);
    }
  }
}

export function requireFuture(row: Doc<"hashDates">, now: number) {
  if (row.status === "in_progress" || row.status === "finished") {
    appError("HASH_ALREADY_STARTED", "This hash has already started.");
  }
  if (row.startsAt <= now) appError("HASH_IN_PAST", "This hash is in the past.");
}

export function hashDateLabel(row: { startsAt: number }) {
  return formatDateTime(row.startsAt);
}

export function hashTimes(dateKey: string, startTime: string, durationMinutes: number) {
  const startsAt = pacificDateAndTimeToMs(dateKey, startTime);
  if (startsAt === null) appError("HASH_INVALID_TIME", `Not a valid date and time: ${dateKey} ${startTime}.`);
  return { startsAt, endsAt: startsAt + durationMinutes * 60_000 };
}

export async function loadSettings(ctx: Ctx) {
  return await ctx.db.query("hashingSettings").first();
}

export async function latestChecklist(ctx: Ctx) {
  return await ctx.db.query("hashChecklistVersions").withIndex("by_version").order("desc").first();
}

/** The current checklist, inserting the seed as version 1 the first time it's needed. */
export async function ensureChecklist(ctx: MutationCtx): Promise<Doc<"hashChecklistVersions">> {
  const latest = await latestChecklist(ctx);
  if (latest) return latest;
  const id = await ctx.db.insert("hashChecklistVersions", {
    version: 1,
    ...HASHING_CHECKLIST_SEED,
    publishedAt: Date.now(),
  });
  const seeded = await ctx.db.get(id);
  if (!seeded) throw new Error("Seeded checklist vanished in its own transaction.");
  return seeded;
}


/** Photos waiting on ops. Well past a healthy queue; the Checklist tab count stops here. */
export const PENDING_PHOTO_TAKE = 200;

export async function loadPendingPhotos(ctx: Ctx) {
  return await ctx.db
    .query("hashReferencePhotos")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .order("desc")
    .take(PENDING_PHOTO_TAKE);
}

/** The roster for one quarter: everyone who owes a hash, and where each one stands. */
export async function loadQuarterPicture(ctx: Ctx, quarterId: string, todayKey: string) {
  const [dates, crew, standings] = await Promise.all([
    loadQuarterDates(ctx, quarterId),
    loadHashCrew(ctx),
    ctx.db
      .query("hashQuarterStanding")
      .withIndex("by_quarterId_and_userId", (q) => q.eq("quarterId", quarterId))
      .take(QUARTER_STANDING_TAKE),
  ]);
  const standingByUser = new Map(standings.map((row) => [row.userId, row.standing]));
  const open = dates.filter((row) => row.status === "scheduled" && row.dateKey >= todayKey);
  const booked = await Promise.all(dates.map((row) => loadDateBookings(ctx, row)));
  const bookingsByDate = new Map(dates.map((row, index) => [row._id, booked[index] ?? []]));
  const answers = await Promise.all(open.map((row) => loadDateAvailability(ctx, row._id)));
  const answersByDate = new Map(open.map((row, index) => [row._id, answers[index] ?? []]));

  const bookingsByUser = new Map<string, { status: HashBookingStatus; row: Doc<"hashDates"> }[]>();
  for (const row of dates) {
    for (const booking of bookingsByDate.get(row._id) ?? []) {
      const list = bookingsByUser.get(booking.userId) ?? [];
      list.push({ status: booking.status, row });
      bookingsByUser.set(booking.userId, list);
    }
  }

  const userByKey = await findAuthUsersByIds(
    ctx,
    crew.map((profile) => profile.userId),
  );
  const people = crew.map((profile) => {
    const user = userByKey.get(profile.userId);
    const standing: HashStanding | undefined = standingByUser.get(profile.userId);
    const state: HashQuarterState = deriveQuarterState({
      bookings: (bookingsByUser.get(profile.userId) ?? [])
        .filter(({ row }) => !isLapsed(row, todayKey))
        .map(({ status, row }) => ({ status, hashStatus: row.status })),
      standing: standing?.kind,
    });
    return {
      userId: profile.userId,
      name: user?.name || user?.email || "Unknown crew",
      state,
      standing,
    };
  });
  return { dates, open, bookingsByDate, answersByDate, people };
}
