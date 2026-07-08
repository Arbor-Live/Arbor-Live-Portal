import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { normalizeEventStatus } from "./lib/eventStatus";

const openRequestStatusValue = v.union(
  v.literal("submitted"),
  v.literal("in_review"),
);

export const listUpcomingAdminEvents = query({
  args: {
    now: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("events"),
      title: v.string(),
      status: v.string(),
      startAt: v.number(),
      endAt: v.number(),
      venueName: v.optional(v.string()),
      invoiceLinked: v.boolean(),
      assignedCrewCount: v.number(),
      unfilledShifts: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
    const candidates = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", args.now))
      .take(40);
    const rows = candidates
      .filter((event) => normalizeEventStatus(event.status) !== "cancelled")
      .sort((a, b) => a.startAt - b.startAt)
      .slice(0, limit);

    return await Promise.all(
      rows.map(async (event) => {
        const shifts = await ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(200);
        const assignedCrewCount = new Set(
          shifts
            .map((shift) => shift.userId?.trim())
            .filter((userId): userId is string => Boolean(userId)),
        ).size;
        const unfilledShifts = shifts.filter((shift) => !shift.userId?.trim()).length;
        return {
          _id: event._id,
          title: event.title,
          status: normalizeEventStatus(event.status),
          startAt: event.startAt,
          endAt: event.endAt,
          venueName: event.venueName,
          invoiceLinked: Boolean(event.invoiceId),
          assignedCrewCount,
          unfilledShifts,
        };
      }),
    );
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
    const inReview = await ctx.db
      .query("eventRequests")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "in_review"))
      .order("desc")
      .take(limit);

    return [...submitted, ...inReview]
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, limit)
      .map((request): {
        _id: typeof request._id;
        requestNumber: string;
        status: "submitted" | "in_review";
        eventName: string | undefined;
        organization: string | undefined;
        venueName: string | undefined;
        submittedAt: number;
      } => ({
        _id: request._id,
        requestNumber: request.requestNumber ?? `LEGACY-${request._id}`,
        status: request.status === "in_review" ? "in_review" : "submitted",
        eventName: request.eventName,
        organization: request.organization,
        venueName: request.venueName,
        submittedAt: request.submittedAt,
      }));
  },
});
