import { pacificDateKey, recentPayPeriods } from "@arbor/format";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  findAuthUsersByIds,
  getUserId,
  requireAdmin,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import {
  listUserShiftsNear,
  ON_SHIFT_PADDING_MS,
  summarizeOnShiftEvents,
} from "./lib/crewShiftWindow";
import { buildUserProfileImageByUserId } from "./lib/userProfileImage";
import { normalizeEventStatus } from "./lib/eventStatus";
import { isHashEvent } from "./lib/hashEvent";
import { loadDateForEvent } from "./lib/hashingData";
import { listMyPostEventWork as listMyPostEventWorkForUser } from "./lib/myEventActions";
import { listShowShifts, userWorkedShowShift } from "./lib/showShift";

const scheduledEventValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  venueName: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.number(),
  shiftCount: v.number(),
  /** Set for a hash: crew go to the runner, not the event page. */
  hashDateId: v.optional(v.id("hashDates")),
});

const activeShiftValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  venueName: v.optional(v.string()),
  startsAt: v.number(),
  endsAt: v.number(),
  phase: v.union(v.literal("upcoming"), v.literal("now"), v.literal("ended")),
  hashDateId: v.optional(v.id("hashDates")),
});

const postEventWorkValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  venueName: v.optional(v.string()),
  endAt: v.number(),
  feedbackSubmitted: v.boolean(),
  rating: v.optional(v.number()),
  peakTurnout: v.optional(v.number()),
  whatWentWell: v.optional(v.string()),
  whatCouldImprove: v.optional(v.string()),
  mediaResolved: v.boolean(),
});

const payPeriodSummaryValue = v.object({
  label: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  dueMs: v.number(),
  daysWorked: v.number(),
});

async function hashDateIdOf(ctx: QueryCtx, event: Doc<"events">) {
  return isHashEvent(event) ? (await loadDateForEvent(ctx, event._id))?._id : undefined;
}

function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

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
        hashDateId: await hashDateIdOf(ctx, event),
      });
    }
    return results.sort((a, b) => a.startAt - b.startAt);
  },
});

/** The events the viewer is working around `now`, most pressing first. */
export const listMyActiveShifts = query({
  args: { now: v.number() },
  returns: v.array(activeShiftValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const shifts = await listUserShiftsNear(ctx, getUserId(user), args.now, ON_SHIFT_PADDING_MS);

    const results = [];
    for (const { eventId, startsAt, endsAt, phase } of summarizeOnShiftEvents(shifts, args.now)) {
      const event = await ctx.db.get(eventId);
      if (!event || normalizeEventStatus(event.status) === "cancelled") continue;
      results.push({
        eventId,
        title: event.title,
        venueName: event.venueName,
        startsAt,
        endsAt,
        phase,
        hashDateId: await hashDateIdOf(ctx, event),
      });
    }
    return results;
  },
});

/** One combined feed of the user's ended events and their outstanding work. */
export const listMyPostEventWork = query({
  args: {
    now: v.number(),
  },
  returns: v.array(postEventWorkValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await listMyPostEventWorkForUser(ctx, getUserId(user), args.now);
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

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    // Only show-shift crew owe media. Anyone else may still upload, but has
    // nothing to resolve, so this is a no-op rather than an error (the upload
    // dropzone calls this after every event upload).
    if (!(await userWorkedShowShift(ctx, args.eventId, userId))) {
      return null;
    }

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

const crewMediaStatusRowValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.optional(v.string()),
  role: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("uploaded"),
    v.literal("no_media"),
  ),
  resolvedAt: v.optional(v.number()),
});

const crewMediaStatusSortOrder: Record<"pending" | "uploaded" | "no_media", number> = {
  pending: 0,
  no_media: 1,
  uploaded: 2,
};

export const listCrewMediaStatusForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(crewMediaStatusRowValue),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);

    // Only show-shift crew owe media — the same set the reminder email asks.
    const shifts = await listShowShifts(ctx, args.eventId);

    // First-assigned role per user; shifts without a userId are not eligible
    // to self-report media status (they have no upload flow).
    const userRole = new Map<string, string>();
    for (const shift of shifts) {
      const uid = shift.userId?.trim();
      if (!uid) continue;
      if (!userRole.has(uid)) userRole.set(uid, shift.role);
    }
    const userIds = Array.from(userRole.keys());
    if (userIds.length === 0) return [];

    const [statusRows, userByKey] = await Promise.all([
      ctx.db
        .query("eventCrewMediaStatus")
        .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", args.eventId))
        .take(500),
      findAuthUsersByIds(ctx, userIds),
    ]);
    const imageByUserId = await buildUserProfileImageByUserId(ctx, userIds, userByKey);
    const statusByUserId = new Map(statusRows.map((row) => [row.userId, row]));

    const rows = userIds.map((userId) => {
      const statusRow = statusByUserId.get(userId);
      const user = userByKey.get(userId);
      return {
        userId,
        name: user?.name ?? user?.email ?? userId,
        email: user?.email ?? "",
        image: imageByUserId.get(userId) ?? user?.image ?? undefined,
        role: userRole.get(userId) ?? "",
        status: (statusRow?.status ?? "pending") as "pending" | "uploaded" | "no_media",
        resolvedAt: statusRow?.resolvedAt,
      };
    });

    rows.sort((a, b) => {
      const orderDiff = crewMediaStatusSortOrder[a.status] - crewMediaStatusSortOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });
    return rows;
  },
});
