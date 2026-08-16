import { addPacificCalendarDays, pacificDateKey } from "@arbor/format";

export const INVOICE_DUE_DAYS_AFTER_EVENT = 30;

/** Earliest linked occurrence start (Day 1), for due-date defaults. */
export function firstLinkedEventStartAtMs(
  events: Array<{ startAt: number }> | undefined | null,
): number | null {
  if (!events?.length) return null;
  return events.reduce((earliest, row) => Math.min(earliest, row.startAt), events[0]!.startAt);
}

/** Pacific calendar date: first event day + N days (default 30). */
export function invoiceDueDateFromFirstEvent(
  firstEventStartAtMs: number,
  days: number = INVOICE_DUE_DAYS_AFTER_EVENT,
) {
  return pacificDateKey(addPacificCalendarDays(firstEventStartAtMs, days));
}
