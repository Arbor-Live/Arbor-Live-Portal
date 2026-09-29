import type { Doc, Id } from "../_generated/dataModel";

/**
 * True when every linked event belongs to the same group — a recurring series
 * or a multi-day booking — where an unscoped artist line applies to every day.
 * The group is `groupId` (falling back to `seriesId` for rows the backfill
 * hasn't reached).
 */
export function isGroupBooking(events: Doc<"events">[]): boolean {
  if (events.length === 0) return false;
  const groupId = events[0]!.groupId ?? events[0]!.seriesId;
  if (groupId === undefined) return false;
  return events.every((event) => (event.groupId ?? event.seriesId) === groupId);
}

/**
 * Whether an artist line applies to a given event: an explicit `eventId` wins;
 * an unscoped line falls back to the first linked day, except on a single group
 * (recurring or multi-day), where it applies to every day.
 */
export function artistLineAppliesToEvent(args: {
  lineEventId?: Id<"events">;
  eventId: Id<"events">;
  firstLinkedEventId?: Id<"events">;
  isGroupBooking: boolean;
}): boolean {
  if (args.lineEventId) return args.lineEventId === args.eventId;
  return args.isGroupBooking || args.firstLinkedEventId === args.eventId;
}
