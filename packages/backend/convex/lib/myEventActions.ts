import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";

/** Bound on events a single user has led or managed. */
const LEAD_EVENT_CAP = 200;
/** Bound on shifts scanned to find a user's ended events (mirrors crewPortal). */
const SHIFT_SCAN_CAP = 500;

export type PendingPhotoEvent = {
  eventId: Id<"events">;
  title: string;
  venueName?: string;
  endAt: number;
};

export type MyPostMortem = {
  eventId: Id<"events">;
  title: string;
  venueName?: string;
  endAt: number;
  submitted: boolean;
  submittedAt?: number;
  rating?: number;
};

/** Events the user is the day-of lead or event manager for. */
export async function listLeadEventsForUser(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"events">[]> {
  const [asLead, asManager] = await Promise.all([
    ctx.db
      .query("events")
      .withIndex("by_dayOfLeadUserId", (q) => q.eq("dayOfLeadUserId", userId))
      .take(LEAD_EVENT_CAP),
    ctx.db
      .query("events")
      .withIndex("by_eventManagerUserId", (q) => q.eq("eventManagerUserId", userId))
      .take(LEAD_EVENT_CAP),
  ]);
  const byId = new Map<Id<"events">, Doc<"events">>();
  for (const event of [...asLead, ...asManager]) byId.set(event._id, event);
  return [...byId.values()];
}

/** Events where the user still owes a photos/videos upload outcome. */
export async function listMyEventsNeedingPhotos(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<PendingPhotoEvent[]> {
  const [shifts, leadEvents, resolvedRows] = await Promise.all([
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) => q.eq("userId", userId))
      .take(SHIFT_SCAN_CAP),
    listLeadEventsForUser(ctx, userId),
    ctx.db
      .query("eventCrewMediaStatus")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(SHIFT_SCAN_CAP),
  ]);
  const resolved = new Set(resolvedRows.map((row) => row.eventId));

  const endedIds = new Set<Id<"events">>();
  for (const shift of shifts) {
    if (shift.endsAt <= now) endedIds.add(shift.eventId);
  }
  for (const event of leadEvents) {
    if (event.endAt <= now) endedIds.add(event._id);
  }

  const leadById = new Map(leadEvents.map((event) => [event._id, event]));
  const results: PendingPhotoEvent[] = [];
  for (const eventId of endedIds) {
    if (resolved.has(eventId)) continue;
    const event = leadById.get(eventId) ?? (await ctx.db.get(eventId));
    if (!event) continue;
    if (normalizeEventStatus(event.status) === "cancelled") continue;
    results.push({
      eventId: event._id,
      title: event.title,
      venueName: event.venueName,
      endAt: event.endAt,
    });
  }
  return results.sort((a, b) => b.endAt - a.endAt);
}

/**
 * Post-mortems for events the user led or managed. Pending reviews first, then
 * most-recently ended.
 */
export async function listMyPostMortems(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<MyPostMortem[]> {
  const leadEvents = await listLeadEventsForUser(ctx, userId);

  const rows: MyPostMortem[] = [];
  for (const event of leadEvents) {
    if (event.endAt > now) continue;
    const feedback = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", userId),
      )
      .first();
    rows.push({
      eventId: event._id,
      title: event.title,
      venueName: event.venueName,
      endAt: event.endAt,
      submitted: Boolean(feedback?.submittedAt),
      submittedAt: feedback?.submittedAt,
      rating: feedback?.rating,
    });
  }

  return rows.sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.endAt - a.endAt;
  });
}
