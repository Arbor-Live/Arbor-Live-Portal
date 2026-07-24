import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isCrewedEventType } from "./crewTeams";
import { normalizeEventStatus } from "./eventStatus";

export function isCrewedEventInRange(
  event: Doc<"events">,
  rangeStart: number,
  rangeEnd: number,
) {
  const status = normalizeEventStatus(event.status);
  if (status === "cancelled") return false;
  if (!isCrewedEventType(event.eventType)) return false;
  return event.startAt <= rangeEnd && event.endAt >= rangeStart;
}

/** Index-bounded scan of crewed events whose startAt falls in the window. */
export async function listCrewedEventsInRange(
  ctx: QueryCtx,
  rangeStart: number,
  rangeEnd: number,
) {
  const startedInRange = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", rangeStart).lte("startAt", rangeEnd))
    .take(150);
  return startedInRange
    .filter((event) => isCrewedEventInRange(event, rangeStart, rangeEnd))
    .sort((a, b) => a.startAt - b.startAt);
}
