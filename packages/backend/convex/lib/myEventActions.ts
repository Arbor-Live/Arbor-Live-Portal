import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";
import { listUserShowShifts } from "./showShift";

/** Bound on media-status rows scanned for one user (mirrors crewPortal). */
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

/**
 * Ended, non-cancelled events whose show shift the user worked. A shift counts
 * only once it has started, and the event itself must have ended — setup/strike
 * shifts and shiftless lead/manager assignments are not post-event work.
 */
async function listMyEndedEventDocs(
  ctx: QueryCtx,
  userId: string,
  now: number,
): Promise<Doc<"events">[]> {
  const shifts = await listUserShowShifts(ctx, userId);
  const eventIds = new Set<Id<"events">>();
  for (const shift of shifts) {
    if (shift.startsAt <= now) eventIds.add(shift.eventId);
  }

  const events: Doc<"events">[] = [];
  for (const eventId of eventIds) {
    const event = await ctx.db.get(eventId);
    if (!event) continue;
    if (event.endAt > now) continue;
    if (normalizeEventStatus(event.status) === "cancelled") continue;
    events.push(event);
  }
  return events;
}

/**
 * Combined post-event work for the user: one row per ended event whose show
 * shift they worked, carrying the feedback they filed and whether media was
 * resolved. Pending events first, then most-recently ended.
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
