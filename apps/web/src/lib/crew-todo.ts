import type { Night } from "@/components/availability/night-card";
import type { PostEventWorkRow } from "@/components/events/post-event-work-card";
import { needsAnswer } from "@/lib/crew-nights";
import { formatDateTime, formatTime, PORTAL_TIMEZONE } from "@/lib/format";

/** One card is one decision, so an event's review and photos are separate cards. */
export type CrewTodo =
  | { kind: "availability"; key: string; night: Night }
  | { kind: "review"; key: string; row: PostEventWorkRow }
  | { kind: "photos"; key: string; row: PostEventWorkRow };

/**
 * Soonest night first, then post-event work most recently ended first. A
 * deferred key goes to the back, in the order deferred; it never leaves.
 */
export function buildCrewTodos(nights: Night[], rows: PostEventWorkRow[], deferredKeys: string[]): CrewTodo[] {
  const availability = nights
    .filter(needsAnswer)
    .sort((a, b) => a.nightKey.localeCompare(b.nightKey))
    .map((night): CrewTodo => ({ kind: "availability", key: `night:${night.nightKey}`, night }));

  const postEvent = [...rows]
    .sort((a, b) => b.endAt - a.endAt)
    .flatMap((row): CrewTodo[] => [
      ...(row.feedbackSubmitted ? [] : [{ kind: "review" as const, key: `review:${row.eventId}`, row }]),
      ...(row.mediaResolved ? [] : [{ kind: "photos" as const, key: `photos:${row.eventId}`, row }]),
    ]);

  const todos = [...availability, ...postEvent];
  const deferred = deferredKeys.flatMap((key) => todos.filter((todo) => todo.key === key));
  return [...todos.filter((todo) => !deferredKeys.includes(todo.key)), ...deferred];
}

const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: PORTAL_TIMEZONE });

/** "Sat 11:40 PM" within the last week, when a weekday is unambiguous; otherwise the date. */
export function endedLabel(endAt: number, now: number) {
  if (now - endAt >= SIX_DAYS) return formatDateTime(endAt);
  return `${WEEKDAY.format(new Date(endAt))} ${formatTime(endAt)}`;
}
