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

/**
 * A set on one of the event's days: `startTime`/`endTime` are `HH:mm`. A start
 * well before the event's start (or, on later days, before 6 AM) is after
 * midnight, so it lands on the next calendar day; an end at or before the
 * start runs past midnight.
 */
export function timeWindowToMs(
  dayKey: string,
  startTime: string,
  endTime: string,
  eventStartAt?: number,
): [number, number] | null {
  let start = pacificDateAndTimeToMs(dayKey, startTime);
  if (start == null) return null;
  const dayOpensAt =
    eventStartAt != null && pacificDateKey(eventStartAt) === dayKey ? eventStartAt : null;
  const afterMidnight =
    dayOpensAt != null
      ? start < dayOpensAt - 12 * HOUR_MS
      : Number(startTime.slice(0, 2)) < 6;
  if (afterMidnight) start = addPacificCalendarDays(start, 1);
  let end = pacificDateAndTimeToMs(pacificDateKey(start), endTime);
  if (end == null) return null;
  if (end <= start) end = addPacificCalendarDays(end, 1);
  return [start, end];
}

/**
 * Which event day a saved start belongs to. A start before 6 AM counts toward
 * the night before when that was an event day (a 1 AM set closes that night).
 */
export function dayKeyForStart(start: number, dayKeys: string[]): string {
  const key = pacificDateKey(start);
  const previous = pacificDateKey(addPacificCalendarDays(start, -1));
  const smallHours = Number(toPacificDateTimeInput(start).slice(11, 13)) < 6;
  if (smallHours && dayKeys.includes(previous)) return previous;
  if (dayKeys.includes(key)) return key;
  return dayKeys[0] ?? key;
}
