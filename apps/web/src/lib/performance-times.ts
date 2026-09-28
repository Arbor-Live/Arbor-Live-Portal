import {
  addPacificCalendarDays,
  pacificDateAndTimeToMs,
  pacificDateKey,
  toPacificDateTimeInput,
} from "@/lib/format";

/**
 * Performance times are entered as wall-clock times on one of the event's
 * days; these turn them into instants (and back) in the portal timezone.
 */

const HOUR_MS = 60 * 60 * 1000;
const MAX_EVENT_DAYS = 14;

/** The event's calendar days (portal timezone), `YYYY-MM-DD`, first to last. */
export function eventDayKeys(eventStartAt: number, eventEndAt?: number): string[] {
  const keys = [pacificDateKey(eventStartAt)];
  if (eventEndAt == null) return keys;
  // An event ending in the small hours still counts as one night.
  const lastKey = pacificDateKey(Math.max(eventStartAt, eventEndAt - 6 * HOUR_MS));
  let cursor = eventStartAt;
  while (keys[keys.length - 1]! < lastKey && keys.length < MAX_EVENT_DAYS) {
    cursor = addPacificCalendarDays(cursor, 1);
    keys.push(pacificDateKey(cursor));
  }
  return keys;
}

/** Starts before this hour belong to the night before (they're after midnight). */
const NIGHT_ENDS_HOUR = 6;

/**
 * A set on one of the event's days: `startTime`/`endTime` are `HH:mm`. One rule
 * on every day: a start before 6 AM is after midnight, so it lands on the next
 * calendar day, and an end at or before the start runs past midnight. The same
 * rule on every day keeps day + time → instant one-to-one, so a saved time
 * always reopens on the day it was entered for.
 */
export function timeWindowToMs(
  dayKey: string,
  startTime: string,
  endTime: string,
): [number, number] | null {
  let start = pacificDateAndTimeToMs(dayKey, startTime);
  if (start == null) return null;
  if (Number(startTime.slice(0, 2)) < NIGHT_ENDS_HOUR) start = addPacificCalendarDays(start, 1);
  let end = pacificDateAndTimeToMs(pacificDateKey(start), endTime);
  if (end == null) return null;
  if (end <= start) end = addPacificCalendarDays(end, 1);
  return [start, end];
}

/** Which event day a saved start was entered for (the inverse of `timeWindowToMs`). */
export function dayKeyForStart(start: number, dayKeys: string[]): string {
  const time = toPacificDateTimeInput(start).slice(11, 16);
  const exact = dayKeys.find((day) => timeWindowToMs(day, time, time)?.[0] === start);
  if (exact) return exact;
  // Saved before this rule, or outside the event's days: show the nearest night.
  const key = pacificDateKey(start);
  const previous = pacificDateKey(addPacificCalendarDays(start, -1));
  if (Number(time.slice(0, 2)) < NIGHT_ENDS_HOUR && dayKeys.includes(previous)) return previous;
  if (dayKeys.includes(key)) return key;
  return dayKeys[0] ?? key;
}
