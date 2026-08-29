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

/** Cap events scanned for the unconfirmed-crew badge (full board uses its own query). */
const UNCONFIRMED_CREW_EVENT_CAP = 40;
/** Cap shifts read per event when deciding confirmation for the badge. */
const UNCONFIRMED_CREW_SHIFT_CAP = 50;
/** Badge counters only need “N” or “N+”; avoid scanning hundreds of status rows. */
const BADGE_STATUS_TAKE = 50;

/**
 * Single subscription for sidebar nav badge counts.
 * Prefer this over stacking per-badge queries on every dashboard page.
 *
 * Logic is inlined (not ctx.runQuery(api.*)) to avoid circular TypeScript
 * inference through `_generated/api`.
 *
 * `includeUnconfirmedCrew` is off by default from the sidebar except on crew
 * scheduling routes — counting it fans out events × shifts and dominated
 * Database I/O when subscribed on every dashboard page.
 */
export const getNavBadges = query({
  args: {
    now: v.number(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    includeArborInternal: v.boolean(),
    includeAdmin: v.boolean(),
    includeBand: v.boolean(),
    includeUnconfirmedCrew: v.optional(v.boolean()),
  },
  returns: v.object({
    pendingAvailability: v.number(),
    unconfirmedCrew: v.number(),
    pendingBookingRequests: v.number(),
    pendingBandApplications: v.number(),
    pendingCrewApplications: v.number(),
    pendingDamageReports: v.number(),
    pendingBandPaymentActions: v.number(),
    quoteChangesRequested: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const includeUnconfirmedCrew = Boolean(args.includeUnconfirmedCrew);

    // Auth gates once up front — helpers below skip re-resolving org/admin.
    if (args.includeArborInternal) {
      await requireArborInternalContext(ctx);
    }
    if (args.includeAdmin) {
      await requireAdmin(ctx);
    }

    const [
      pendingAvailability,
      unconfirmedCrew,
      pendingBookingRequests,
      pendingBandApplications,
      pendingCrewApplications,
      pendingDamageReports,
      pendingBandPaymentActions,
      quoteChangesRequested,
    ] = await Promise.all([
      args.includeArborInternal
        ? countMyPendingAvailability(ctx, getUserId(user), args.now)
        : Promise.resolve(0),
      args.includeArborInternal && args.includeAdmin && includeUnconfirmedCrew
        ? countUnconfirmedCrew(ctx, args.rangeStart, args.rangeEnd)
        : Promise.resolve(0),
      args.includeArborInternal ? countOpenBookingRequests(ctx) : Promise.resolve(0),
      args.includeAdmin ? countSubmittedBandApplications(ctx) : Promise.resolve(0),
      args.includeAdmin ? countSubmittedCrewApplications(ctx) : Promise.resolve(0),
      args.includeArborInternal ? countPendingDamageReports(ctx) : Promise.resolve(0),
      args.includeBand ? countPendingBandPaymentActions(ctx) : Promise.resolve(0),
      args.includeArborInternal ? countQuoteChangesRequested(ctx) : Promise.resolve(0),
    ]);

    return {
      pendingAvailability,
      unconfirmedCrew,
      pendingBookingRequests,
      pendingBandApplications,
      pendingCrewApplications,
      pendingDamageReports,
      pendingBandPaymentActions,
      quoteChangesRequested,
    };
  },
});

function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

function isShiftFilled(shift: Doc<"eventCrewShifts">) {
  return Boolean(shift.userId?.trim());
}

async function getCurrentUserProfile(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

async function countMyPendingAvailability(ctx: QueryCtx, userId: string, now: number) {
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

async function eventIsCrewUnconfirmed(ctx: QueryCtx, eventId: Doc<"events">["_id"]) {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(UNCONFIRMED_CREW_SHIFT_CAP);
  // Match previous semantics: zero shifts ⇒ not confirmed.
  if (shifts.length === 0) return true;
  return shifts.some((shift) => !isShiftFilled(shift));
}

async function countUnconfirmedCrew(ctx: QueryCtx, rangeStart: number, rangeEnd: number) {
  if (rangeEnd < rangeStart) {
    throw new Error("Date range end must be on or after the start.");
  }
  const upcomingCrewed = (await listCrewedEventsInRange(ctx, rangeStart, rangeEnd)).slice(
    0,
    UNCONFIRMED_CREW_EVENT_CAP,
  );
  const flags = await Promise.all(
    upcomingCrewed.map((event) => eventIsCrewUnconfirmed(ctx, event._id)),
  );
  return flags.filter(Boolean).length;
}

async function countOpenBookingRequests(ctx: QueryCtx) {
  const submitted = await ctx.db
    .query("eventRequests")
    .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "submitted"))
    .take(BADGE_STATUS_TAKE);
  const inReview = await ctx.db
    .query("eventRequests")
    .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "in_review"))
    .take(BADGE_STATUS_TAKE);
  return submitted.length + inReview.length;
}

async function countSubmittedBandApplications(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("bandApplications")
    .withIndex("by_status", (q) => q.eq("status", "submitted"))
    .take(BADGE_STATUS_TAKE);
  return rows.length;
}

async function countSubmittedCrewApplications(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("crewApplications")
    .withIndex("by_status", (q) => q.eq("status", "submitted"))
    .take(BADGE_STATUS_TAKE);
  return rows.length;
}

async function countPendingDamageReports(ctx: QueryCtx) {
  const open = await ctx.db
    .query("damageReports")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .take(BADGE_STATUS_TAKE);
  const inProgress = await ctx.db
    .query("damageReports")
    .withIndex("by_status", (q) => q.eq("status", "in_progress"))
    .take(BADGE_STATUS_TAKE);
  return open.length + inProgress.length;
}

async function countQuoteChangesRequested(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_clientApprovalStatus", (q) => q.eq("clientApprovalStatus", "changes_requested"))
    .take(BADGE_STATUS_TAKE);
  return rows.filter((invoice) => invoice.status !== "void").length;
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
    .take(100);

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
