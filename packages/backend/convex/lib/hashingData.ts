import { formatDateTime, pacificDateAndTimeToMs, pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SITE_URL } from "../email/constants";
import {
  findAuthUsersByIds,
  getUserAdminProfile,
  getUserId,
  hasOperationsAccess,
  requireAuth,
  requireArborInternalContext,
} from "./auth";
import { appError } from "./errors";
import { HASHING_CHECKLIST_SEED } from "./hashingChecklistSeed";
import { isTemplateEnabledForChannel } from "./emailPreferences";
import { recordInAppNotification } from "./inAppNotifications";
import { resolveParticipationFlags } from "./userParticipation";
import { loadAdminProfilesByStatus } from "./userProfiles";
import { resolveUserStatus } from "./userStatus";
import { isStaffMember, resolveProfileMembership } from "./userVerticals";
import { deriveQuarterState, isLapsed, type HashQuarterState } from "./hashing";
import type { HashStanding } from "./hashingValues";

/** Regular weeks plus added dates. A quarter is about 11 weeks. */
export const QUARTER_DATE_LIMIT = 60;
/** Far past any capacity; the live count stays exact up to here. */
const DATE_BOOKING_TAKE = 100;
/** One answer per crew member per date; the roster is a few hundred at most. */
const DATE_AVAILABILITY_TAKE = 1000;
/** Standings for one quarter: at most one per crew member. */
const QUARTER_STANDING_TAKE = 1000;
/** Someone's bookings across every quarter; one or two a quarter. */
const USER_BOOKING_TAKE = 200;

type Ctx = QueryCtx | MutationCtx;
type Profile = Doc<"userAdminProfiles">;

/** Owes a hash: the same people held to the crew hours minimum. */
export function isHashCrew(profile: Profile | null | undefined): profile is Profile {
  if (!profile) return false;
  if (resolveUserStatus(profile) !== "active") return false;
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

export async function loadDateBookings(ctx: Ctx, hashDateId: Id<"hashDates">) {
  return await ctx.db
    .query("hashBookings")
    .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", hashDateId))
    .take(DATE_BOOKING_TAKE);
}

export async function loadDateAvailability(ctx: Ctx, hashDateId: Id<"hashDates">) {
  return await ctx.db
    .query("hashAvailability")
    .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", hashDateId))
    .take(DATE_AVAILABILITY_TAKE);
}

export async function loadUserBookings(ctx: Ctx, userId: string) {
  return await ctx.db
    .query("hashBookings")
    .withIndex("by_userId_and_hashDateId", (q) => q.eq("userId", userId))
    .take(USER_BOOKING_TAKE);
}

export async function loadStanding(ctx: Ctx, userId: string, quarterId: string) {
  return await ctx.db
    .query("hashQuarterStanding")
    .withIndex("by_quarterId_and_userId", (q) => q.eq("quarterId", quarterId).eq("userId", userId))
    .unique();
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

export type HashNotice = "booked" | "unbooked" | "moved";

const NOTICES: Record<HashNotice, { template: "crew_scheduled" | "crew_unscheduled"; title: (label: string) => string }> = {
  booked: { template: "crew_scheduled", title: (label) => `Hash booked: ${label}` },
  unbooked: { template: "crew_unscheduled", title: (label) => `Hash removed: ${label}` },
  moved: { template: "crew_scheduled", title: (label) => `Hash moved: ${label}. Can you still make it?` },
};

/**
 * A hash has no email, so this writes the bell directly. It shares the crew
 * assignment kinds, so their in-app and push opt-outs cover hashes too.
 */
export async function notifyHash(
  ctx: MutationCtx,
  args: { userId: string; notice: HashNotice; row: Doc<"hashDates">; location?: string },
) {
  const { template, title } = NOTICES[args.notice];
  const profile = await getUserAdminProfile(ctx, args.userId);
  if (!isTemplateEnabledForChannel(profile, template, "inApp")) return;
  await recordInAppNotification(ctx, {
    userId: args.userId,
    template,
    subject: title(hashDateLabel(args.row)),
    payload: { eventUrl: `${SITE_URL}/dashboard/events/hashing`, venueName: args.location },
    idempotencyKey: `hashing:${args.notice}:${args.row._id}:${args.userId}:${Date.now()}`,
  });
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


/** The roster for one quarter: everyone who owes a hash, and where each one stands. */
export async function loadQuarterPicture(ctx: Ctx, quarterId: string, now: number) {
  const todayKey = pacificDateKey(now);
  const [dates, profiles, standings] = await Promise.all([
    loadQuarterDates(ctx, quarterId),
    loadAdminProfilesByStatus(ctx, ["active"]),
    ctx.db
      .query("hashQuarterStanding")
      .withIndex("by_quarterId_and_userId", (q) => q.eq("quarterId", quarterId))
      .take(QUARTER_STANDING_TAKE),
  ]);
  const crew = profiles.filter(isHashCrew);
  const standingByUser = new Map(standings.map((row) => [row.userId, row.standing]));
  const open = dates.filter((row) => row.status === "scheduled" && row.startsAt > now);
  const booked = await Promise.all(dates.map((row) => loadDateBookings(ctx, row._id)));
  const bookingsByDate = new Map(dates.map((row, index) => [row._id, booked[index] ?? []]));
  const answers = await Promise.all(open.map((row) => loadDateAvailability(ctx, row._id)));
  const answersByDate = new Map(open.map((row, index) => [row._id, answers[index] ?? []]));

  const bookingsByUser = new Map<string, { status: Doc<"hashBookings">["status"]; row: Doc<"hashDates"> }[]>();
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
