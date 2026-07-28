import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  getUserId,
  requireAdmin,
  requireArborInternalContext,
  requireAuth,
  requireBandContext,
} from "./lib/auth";
import { isBandPayeeComplete, payeeFieldsFromProfile } from "./lib/bandPayments";
import { listCrewedEventsInRange } from "./lib/crewedEvents";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  eventMatchesUserTeams,
} from "./lib/crewTeams";
import {
  getDisciplinesForEventMatching,
  resolveProfileMembership,
} from "./lib/userVerticals";

/**
 * Single subscription for sidebar nav badge counts.
 * Prefer this over stacking per-badge queries on every dashboard page.
 *
 * Logic is inlined (not ctx.runQuery(api.*)) to avoid circular TypeScript
 * inference through `_generated/api`.
 */
export const getNavBadges = query({
  args: {
    now: v.number(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    includeArborInternal: v.boolean(),
    includeAdmin: v.boolean(),
    includeBand: v.boolean(),
  },
  returns: v.object({
    pendingAvailability: v.number(),
    unconfirmedCrew: v.number(),
    pendingBookingRequests: v.number(),
    pendingBandApplications: v.number(),
    pendingCrewApplications: v.number(),
    pendingDamageReports: v.number(),
    pendingBandPaymentActions: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const [
      pendingAvailability,
      unconfirmedCrew,
      pendingBookingRequests,
      pendingBandApplications,
      pendingCrewApplications,
      pendingDamageReports,
      pendingBandPaymentActions,
    ] = await Promise.all([
      args.includeArborInternal
        ? countMyPendingAvailability(ctx, getUserId(user), args.now)
        : Promise.resolve(0),
      args.includeArborInternal && args.includeAdmin
        ? countUnconfirmedCrew(ctx, args.rangeStart, args.rangeEnd)
        : Promise.resolve(0),
      args.includeArborInternal ? countOpenBookingRequests(ctx) : Promise.resolve(0),
      args.includeAdmin ? countSubmittedBandApplications(ctx) : Promise.resolve(0),
      args.includeAdmin ? countSubmittedCrewApplications(ctx) : Promise.resolve(0),
      args.includeArborInternal ? countPendingDamageReports(ctx) : Promise.resolve(0),
      args.includeBand ? countPendingBandPaymentActions(ctx) : Promise.resolve(0),
    ]);

    return {
      pendingAvailability,
      unconfirmedCrew,
      pendingBookingRequests,
      pendingBandApplications,
      pendingCrewApplications,
      pendingDamageReports,
      pendingBandPaymentActions,
    };
  },
});

function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

function computeShiftStats(shifts: Doc<"eventCrewShifts">[]) {
  const totalShifts = shifts.length;
  const filledShifts = shifts.filter((shift) => Boolean(shift.userId?.trim())).length;
  const isCrewConfirmed = totalShifts > 0 && filledShifts === totalShifts;
  return { totalShifts, filledShifts, unfilledShifts: totalShifts - filledShifts, isCrewConfirmed };
}

async function getCurrentUserProfile(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

async function countMyPendingAvailability(ctx: QueryCtx, userId: string, now: number) {
  await requireArborInternalContext(ctx);
  const profile = await getCurrentUserProfile(ctx, userId);
  const userDisciplines = getDisciplinesForEventMatching(
    resolveProfileMembership(profile ?? {}).disciplines,
  );
  const windowEnd = now + weeksToMs(DEFAULT_AVAILABILITY_WEEKS);
  const matchedEvents = (await listCrewedEventsInRange(ctx, now, windowEnd)).filter((event) =>
    eventMatchesUserTeams(event.teamsInterested, userDisciplines),
  );
  if (matchedEvents.length === 0) return 0;

  const myResponses = await ctx.db
    .query("eventCrewAvailabilityResponses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(500);
  const respondedEventIds = new Set(myResponses.map((response) => response.eventId));
  return matchedEvents.filter((event) => !respondedEventIds.has(event._id)).length;
}

async function countUnconfirmedCrew(ctx: QueryCtx, rangeStart: number, rangeEnd: number) {
  await requireArborInternalContext(ctx);
  if (rangeEnd < rangeStart) {
    throw new Error("Date range end must be on or after the start.");
  }
  const upcomingCrewed = await listCrewedEventsInRange(ctx, rangeStart, rangeEnd);
  const shiftPages = await Promise.all(
    upcomingCrewed.map((event) =>
      ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(100),
    ),
  );
  return shiftPages.filter((shifts) => !computeShiftStats(shifts).isCrewConfirmed).length;
}

async function countOpenBookingRequests(ctx: QueryCtx) {
  await requireArborInternalContext(ctx);
  const submitted = await ctx.db
    .query("eventRequests")
    .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "submitted"))
    .take(200);
  const inReview = await ctx.db
    .query("eventRequests")
    .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "in_review"))
    .take(200);
  return submitted.length + inReview.length;
}

async function countSubmittedBandApplications(ctx: QueryCtx) {
  await requireAdmin(ctx);
  const rows = await ctx.db
    .query("bandApplications")
    .withIndex("by_status", (q) => q.eq("status", "submitted"))
    .take(200);
  return rows.length;
}

async function countSubmittedCrewApplications(ctx: QueryCtx) {
  await requireAdmin(ctx);
  const rows = await ctx.db
    .query("crewApplications")
    .withIndex("by_status", (q) => q.eq("status", "submitted"))
    .take(200);
  return rows.length;
}

async function countPendingDamageReports(ctx: QueryCtx) {
  await requireArborInternalContext(ctx);
  const open = await ctx.db
    .query("damageReports")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .take(500);
  const inProgress = await ctx.db
    .query("damageReports")
    .withIndex("by_status", (q) => q.eq("status", "in_progress"))
    .take(500);
  return open.length + inProgress.length;
}

async function countPendingBandPaymentActions(ctx: QueryCtx) {
  const bandContext = await requireBandContext(ctx);
  const user = await requireAuth(ctx);
  const userId = getUserId(user);
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
    .unique();
  const payeeComplete = isBandPayeeComplete(payeeFieldsFromProfile(profile));

  const payments = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", bandContext.organizationId))
    .take(200);

  let awaitingSignatureForMe = 0;
  let waitingOnPayeeSetup = 0;
  for (const payment of payments) {
    if (payment.status === "cancelled" || payment.status === "draft") continue;
    if (
      payment.status === "awaiting_confirmation" &&
      payment.designatedPayeeUserId &&
      payment.designatedPayeeUserId === userId
    ) {
      awaitingSignatureForMe += 1;
    }
    if (payment.status === "pending_payee" && !payeeComplete) {
      waitingOnPayeeSetup += 1;
    }
  }
  return awaitingSignatureForMe + (waitingOnPayeeSetup > 0 ? 1 : 0);
}
