import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";

/** Bound on events a single user has led or managed. */
const LEAD_EVENT_CAP = 200;
/** Bound on shifts scanned to find a user's ended events (mirrors crewPortal). */
const SHIFT_SCAN_CAP = 500;

/** One ended event's outstanding/completed post-event work for a single user. */
export type PostEventWorkItem = {
  eventId: Id<"events">;
  title: string;
  venueName?: string;
  endAt: number;
  feedbackSubmitted: boolean;
  rating?: number;
  whatWentWell?: string;
  whatCouldImprove?: string;
  mediaResolved: boolean;
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

/**
 * Whether a user is expected to do post-event work for an event: any assigned
 * shift, or the day-of lead / event manager.
 */
export async function isAssignedToEvent(
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: string,
): Promise<boolean> {
  const event = await ctx.db.get(eventId);
  if (!event) return false;
  if (event.dayOfLeadUserId === userId || event.eventManagerUserId === userId) return true;
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(SHIFT_SCAN_CAP);
  return shifts.some((shift) => shift.userId === userId);
}

/**
 * Ended, non-cancelled events the user crewed or led / managed.
 * A shift only counts once it has started, and the event itself must have
 * ended — a finished call on a show that is still ahead is not post-event work.
 */
async function listMyEndedEventDocs(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<Doc<"events">[]> {
  const [shifts, leadEvents] = await Promise.all([
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) => q.eq("userId", userId))
      .take(SHIFT_SCAN_CAP),
    listLeadEventsForUser(ctx, userId),
  ]);

  const endedIds = new Set<Id<"events">>();
  for (const shift of shifts) {
    if (shift.startsAt <= now) endedIds.add(shift.eventId);
  }
  for (const event of leadEvents) {
    if (event.endAt <= now) endedIds.add(event._id);
  }

  const leadById = new Map(leadEvents.map((event) => [event._id, event]));
  const events: Doc<"events">[] = [];
  for (const eventId of endedIds) {
    const event = leadById.get(eventId) ?? (await ctx.db.get(eventId));
    if (!event) continue;
    if (event.endAt > now) continue;
    if (normalizeEventStatus(event.status) === "cancelled") continue;
    events.push(event);
  }
  return events;
}

/**
 * Combined post-event work for the user: one row per ended event they crewed or
 * led, carrying the feedback they filed and whether media was resolved. Pending
 * events first, then most-recently ended.
 */
export async function listMyPostEventWork(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<PostEventWorkItem[]> {
  const [events, mediaRows] = await Promise.all([
    listMyEndedEventDocs(ctx, userId, now),
    ctx.db
      .query("eventCrewMediaStatus")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(SHIFT_SCAN_CAP),
  ]);
  const mediaResolved = new Set(mediaRows.map((row) => row.eventId));

  const rows: PostEventWorkItem[] = [];
  for (const event of events) {
    const feedback = await ctx.db
      .query("postMortemFeedback")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", userId),
      )
      .first();
    const submitted = Boolean(feedback?.submittedAt);
    rows.push({
      eventId: event._id,
      title: event.title,
      venueName: event.venueName,
      endAt: event.endAt,
      feedbackSubmitted: submitted,
      rating: feedback?.rating,
      whatWentWell: feedback?.whatWentWell,
      whatCouldImprove: feedback?.whatCouldImprove,
      mediaResolved: mediaResolved.has(event._id),
    });
  }

  return rows.sort((a, b) => {
    const aDone = a.feedbackSubmitted && a.mediaResolved;
    const bDone = b.feedbackSubmitted && b.mediaResolved;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return b.endAt - a.endAt;
  });
}

/** Events in `listMyPostEventWork` that still need the user's feedback or media. */
export function countPendingPostEventWork(items: PostEventWorkItem[]): number {
  return items.filter((item) => !item.feedbackSubmitted || !item.mediaResolved).length;
}
