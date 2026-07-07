import { pacificDateKey, recentPayPeriods } from "@arbor/format";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getUserId,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  eventMatchesUserTeams,
  isCrewedEventType,
} from "./lib/crewTeams";
import { normalizeEventStatus } from "./lib/eventStatus";

const scheduleBlockSummaryValue = v.object({
  _id: v.id("eventScheduleBlocks"),
  blockType: v.string(),
  label: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  notes: v.optional(v.string()),
});

const pendingEventValue = v.object({
  _id: v.id("events"),
  title: v.string(),
  status: v.string(),
  eventType: v.optional(v.string()),
  venueName: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.number(),
  scheduleBlocks: v.array(scheduleBlockSummaryValue),
});

const scheduledEventValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  venueName: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.number(),
  shiftCount: v.number(),
});

const needsPhotosEventValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  venueName: v.optional(v.string()),
  endAt: v.number(),
});

const payPeriodSummaryValue = v.object({
  label: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  dueMs: v.number(),
  daysWorked: v.number(),
});

function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

function isUpcomingCrewedEvent(event: Doc<"events">, now: number, windowEnd: number) {
  if (!isCrewedEventType(event.eventType)) return false;
  if (normalizeEventStatus(event.status) === "cancelled") return false;
  return event.endAt >= now && event.startAt <= windowEnd;
}

async function getCurrentUserProfile(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export const listMyPendingAvailability = query({
  args: {
    now: v.number(),
    weeksAhead: v.optional(v.number()),
  },
  returns: v.array(pendingEventValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);
    const profile = await getCurrentUserProfile(ctx, userId);
    const userTeams = profile?.teams ?? [];
    const weeksAhead = args.weeksAhead ?? DEFAULT_AVAILABILITY_WEEKS;
    const windowEnd = args.now + weeksToMs(weeksAhead);

    const events = await ctx.db.query("events").withIndex("by_startAt").take(300);
    const matchedEvents = events
      .filter(
        (event) =>
          isUpcomingCrewedEvent(event, args.now, windowEnd) &&
          eventMatchesUserTeams(event.teamsInterested, userTeams),
      )
      .sort((a, b) => a.startAt - b.startAt);

    const results = [];
    for (const event of matchedEvents) {
      const existing = await ctx.db
        .query("eventCrewAvailabilityResponses")
        .withIndex("by_eventId_and_userId", (q) =>
          q.eq("eventId", event._id).eq("userId", userId),
        )
        .unique();
      if (existing) continue;

      const blocks = await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
        .take(100);

      results.push({
        _id: event._id,
        title: event.title,
        status: normalizeEventStatus(event.status),
        eventType: event.eventType,
        venueName: event.venueName,
        startAt: event.startAt,
        endAt: event.endAt,
        scheduleBlocks: blocks.map((block) => ({
          _id: block._id,
          blockType: block.blockType,
          label: block.label,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          notes: block.notes,
        })),
      });
    }
    return results;
  },
});

export const listMyScheduledEvents = query({
  args: {
    now: v.number(),
    weeksAhead: v.optional(v.number()),
  },
  returns: v.array(scheduledEventValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);
    const weeksAhead = args.weeksAhead ?? 8;
    const windowEnd = args.now + weeksToMs(weeksAhead);

    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) =>
        q.eq("userId", userId).gte("startsAt", args.now).lte("startsAt", windowEnd),
      )
      .take(500);

    const byEvent = new Map<
      Id<"events">,
      { shiftCount: number; earliestStart: number; latestEnd: number }
    >();
    for (const shift of shifts) {
      const existing = byEvent.get(shift.eventId);
      if (!existing) {
        byEvent.set(shift.eventId, {
          shiftCount: 1,
          earliestStart: shift.startsAt,
          latestEnd: shift.endsAt,
        });
      } else {
        existing.shiftCount += 1;
        existing.earliestStart = Math.min(existing.earliestStart, shift.startsAt);
        existing.latestEnd = Math.max(existing.latestEnd, shift.endsAt);
      }
    }

    const results = [];
    for (const [eventId, summary] of byEvent.entries()) {
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      if (normalizeEventStatus(event.status) === "cancelled") continue;
      results.push({
        eventId,
        title: event.title,
        venueName: event.venueName,
        startAt: summary.earliestStart,
        endAt: summary.latestEnd,
        shiftCount: summary.shiftCount,
      });
    }
    return results.sort((a, b) => a.startAt - b.startAt);
  },
});

export const listMyEventsNeedingPhotos = query({
  args: {
    now: v.number(),
  },
  returns: v.array(needsPhotosEventValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) => q.eq("userId", userId))
      .take(500);
    const endedEventIds = new Set<Id<"events">>();
    for (const shift of shifts) {
      if (shift.endsAt <= args.now) endedEventIds.add(shift.eventId);
    }

    const results = [];
    for (const eventId of endedEventIds) {
      const resolved = await ctx.db
        .query("eventCrewMediaStatus")
        .withIndex("by_eventId_and_userId", (q) =>
          q.eq("eventId", eventId).eq("userId", userId),
        )
        .unique();
      if (resolved) continue;

      const event = await ctx.db.get(eventId);
      if (!event) continue;
      if (normalizeEventStatus(event.status) === "cancelled") continue;
      results.push({
        eventId,
        title: event.title,
        venueName: event.venueName,
        endAt: event.endAt,
      });
    }
    return results.sort((a, b) => b.endAt - a.endAt);
  },
});

export const getMyPayPeriodSummary = query({
  args: {
    now: v.number(),
  },
  returns: v.array(payPeriodSummaryValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);
    const periods = recentPayPeriods(args.now, 3);

    const summaries = [];
    for (const period of periods) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_userId_and_startsAt", (q) =>
          q
            .eq("userId", userId)
            .gte("startsAt", period.startMs)
            .lte("startsAt", period.endMs),
        )
        .take(500);
      const dayKeys = new Set(shifts.map((shift) => pacificDateKey(shift.startsAt)));
      summaries.push({
        label: period.label,
        startMs: period.startMs,
        endMs: period.endMs,
        dueMs: period.dueMs,
        daysWorked: dayKeys.size,
      });
    }
    return summaries;
  },
});

export const resolveMyEventMedia = mutation({
  args: {
    eventId: v.id("events"),
    status: v.union(v.literal("uploaded"), v.literal("no_media")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);
    const now = Date.now();

    const myShifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) => q.eq("userId", userId))
      .take(500);
    const hasShift = myShifts.some((shift) => shift.eventId === args.eventId);
    if (!hasShift) throw new Error("You are not assigned to this event.");

    const existing = await ctx.db
      .query("eventCrewMediaStatus")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", args.eventId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        resolvedAt: now,
      });
    } else {
      await ctx.db.insert("eventCrewMediaStatus", {
        eventId: args.eventId,
        userId,
        status: args.status,
        resolvedAt: now,
      });
    }
    return null;
  },
});
