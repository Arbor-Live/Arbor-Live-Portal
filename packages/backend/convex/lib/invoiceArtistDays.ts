import type { Doc, Id } from "../_generated/dataModel";

/**
 * True when every linked event belongs to the same (non-null) series — a
 * recurring show, where an unscoped artist line applies to every occurrence.
 * Mixed invoices (some non-series days, or days from different series) are
 * treated as multi-day bookings instead.
 */
export function isSingleSeriesBooking(events: Doc<"events">[]): boolean {
  const seriesId = events[0]?.seriesId;
  if (seriesId === undefined) return false;
  return events.every((event) => event.seriesId === seriesId);
}

/**
 * Whether an artist line applies to a given event: an explicit `eventId` wins;
 * an unscoped line falls back to the first linked day, except on a single
 * recurring series, where it applies to every day.
 */
export function artistLineAppliesToEvent(args: {
  lineEventId?: Id<"events">;
  eventId: Id<"events">;
  firstLinkedEventId?: Id<"events">;
  isSeriesBooking: boolean;
}): boolean {
  if (args.lineEventId) return args.lineEventId === args.eventId;
  return args.isSeriesBooking || args.firstLinkedEventId === args.eventId;
}
