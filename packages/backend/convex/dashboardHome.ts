import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { computeShiftStats } from "./lib/crewShiftKinds";
import { DEFAULT_AVAILABILITY_WEEKS, isCrewedEventType } from "./lib/crewTeams";
import { loadBackupUserIds } from "./lib/crewBackups";
import { eligibleCrewProfilesForEvent, getActiveCrewProfiles } from "./lib/crewedEvents";
import { listAdditionalInvoiceIds } from "./lib/eventInvoiceLinks";
import { normalizeEventStatus } from "./lib/eventStatus";

const openRequestStatusValue = v.union(
  v.literal("submitted"),
  v.literal("action_required"),
);

/** Events in the crewing window, all classified (each reads its shifts). */
const WINDOW_SCAN_LIMIT = 200;

/**
 * Home's one list of upcoming events, each with the flags that need someone:
 * open crew slots or slots held by a backup (and how many eligible crew
 * haven't replied), no quote, no
 * day-of lead. Every event needing crew in the crewing window is
 * kept, then the soonest others fill up to `limit`.
 */
export const listUpcomingAdminEvents = query({
  args: {
    now: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    windowWeeks: v.number(),
    windowEventCount: v.number(),
    needsCrewCount: v.number(),
    events: v.array(
      v.object({
        _id: v.id("events"),
        title: v.string(),
        status: v.string(),
        eventType: v.optional(v.string()),
        startAt: v.number(),
        endAt: v.number(),
        venueName: v.optional(v.string()),
        crewed: v.boolean(),
        assignedCrewCount: v.number(),
        totalShifts: v.number(),
        unfilledShifts: v.number(),
        /** Filled slots held by a backup ("only if necessary"). */
        backupShifts: v.number(),
        needsCrew: v.boolean(),
        awaitingReplies: v.number(),
        missingInvoice: v.boolean(),
        missingLead: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const limit = Math.min(Math.max(args.limit ?? 6, 1), 10);
    const windowEnd = args.now + DEFAULT_AVAILABILITY_WEEKS * 7 * 24 * 60 * 60 * 1000;
    const live = (event: Doc<"events">) => normalizeEventStatus(event.status) !== "cancelled";
    // Every event in the crewing window is classified, so the counts cover the
    // whole window; past it, only the soonest few fill out the list.
    const windowEvents = (
      await ctx.db
        .query("events")
        .withIndex("by_startAt", (q) => q.gte("startAt", args.now).lte("startAt", windowEnd))
        .take(WINDOW_SCAN_LIMIT)
    ).filter(live);
    const later = (
      await ctx.db
        .query("events")
        .withIndex("by_startAt", (q) => q.gt("startAt", windowEnd))
        .take(limit * 3)
    )
      .filter(live)
      .slice(0, limit);
    const candidates = [...windowEvents, ...later];

    const crewProfiles = await getActiveCrewProfiles(ctx);
    const rows = await Promise.all(
      candidates.map(async (event) => {
        const crewed = isCrewedEventType(event.eventType);
        const inWindow = event.startAt <= windowEnd;
        const shifts = await ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(200);
        // A slot held by a backup ("only if necessary") still needs coverage.
        const backupUserIds = crewed && inWindow ? await loadBackupUserIds(ctx, event._id) : undefined;
        const stats = computeShiftStats(shifts, backupUserIds);
        const needsCrew = crewed && inWindow && !stats.isCrewConfirmed;
        let awaitingReplies = 0;
        if (needsCrew) {
          const responses = await ctx.db
            .query("eventCrewAvailabilityResponses")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .take(500);
          const responded = new Set(responses.map((response) => response.userId));
          awaitingReplies = eligibleCrewProfilesForEvent(event.teamsInterested, crewProfiles).filter(
            (profile) => !responded.has(profile.userId),
          ).length;
        }
        const additionalInvoiceIds = event.invoiceId
          ? []
          : await listAdditionalInvoiceIds(ctx, event._id);
        return {
          _id: event._id,
          title: event.title,
          status: normalizeEventStatus(event.status),
          eventType: event.eventType,
          startAt: event.startAt,
          endAt: event.endAt,
          venueName: event.venueName,
          crewed,
          assignedCrewCount: new Set(
            shifts
              .map((shift) => shift.userId?.trim())
              .filter((userId): userId is string => Boolean(userId)),
          ).size,
          totalShifts: stats.totalShifts,
          unfilledShifts: stats.unfilledShifts,
          backupShifts: stats.backupShifts,
          needsCrew,
          awaitingReplies,
          missingInvoice: !event.invoiceId && additionalInvoiceIds.length === 0,
          missingLead: !event.dayOfLeadUserId,
          inWindow,
        };
      }),
    );

    const sorted = rows.sort((a, b) => a.startAt - b.startAt);
    const needsCrew = sorted.filter((row) => row.needsCrew);
    const fill = sorted.filter((row) => !row.needsCrew).slice(0, Math.max(0, limit - needsCrew.length));
    const picked = new Set([...needsCrew, ...fill].map((row) => row._id));
    return {
      windowWeeks: DEFAULT_AVAILABILITY_WEEKS,
      windowEventCount: sorted.filter((row) => row.inWindow).length,
      needsCrewCount: needsCrew.length,
      events: sorted
        .filter((row) => picked.has(row._id))
        .map(({ inWindow: _inWindow, ...row }) => row),
    };
  },
});

export const listOpenBookingRequests = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("eventRequests"),
      requestNumber: v.string(),
      status: openRequestStatusValue,
      eventName: v.optional(v.string()),
      organization: v.optional(v.string()),
      venueName: v.optional(v.string()),
      submittedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
    const submitted = await ctx.db
      .query("eventRequests")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "submitted"))
      .order("desc")
      .take(limit);
    const actionRequired = await ctx.db
      .query("eventRequests")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "action_required"))
      .order("desc")
      .take(limit);
    const legacyInReview = await ctx.db
      .query("eventRequests")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "in_review"))
      .order("desc")
      .take(limit);

    return [...submitted, ...actionRequired, ...legacyInReview]
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, limit)
      .map((request): {
        _id: typeof request._id;
        requestNumber: string;
        status: "submitted" | "action_required";
        eventName: string | undefined;
        organization: string | undefined;
        venueName: string | undefined;
        submittedAt: number;
      } => ({
        _id: request._id,
        requestNumber: request.requestNumber ?? `LEGACY-${request._id}`,
        status: request.status === "submitted" ? "submitted" : "action_required",
        eventName: request.eventName,
        organization: request.organization,
        venueName: request.venueName,
        submittedAt: request.submittedAt,
      }));
  },
});
