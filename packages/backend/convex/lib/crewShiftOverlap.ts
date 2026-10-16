import {
  CREW_OVERLAP_LOOKBACK_MS,
  crewCountableHours,
  overlappingCrewShiftIds,
  type CrewOverlapShift,
} from "@arbor/invoice-document/crew-hours";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";

/**
 * One person on two shifts at once counts the shared time once, on the shift
 * that starts first (`crewCountableHours` in `@arbor/invoice-document/crew-hours`).
 * These are the backend's reads around that rule.
 */

export type OverlapShiftDoc = Pick<
  Doc<"eventCrewShifts">,
  "_id" | "_creationTime" | "eventId" | "userId" | "startsAt" | "endsAt" | "hours"
>;

/** Most of one person's shifts read around a window (a quarter is far below this). */
const USER_SHIFT_READ_CAP = 1000;

function toOverlapShift(shift: OverlapShiftDoc, cancelled?: boolean): CrewOverlapShift {
  return {
    id: shift._id,
    userId: shift.userId,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    hours: shift.hours,
    createdAt: shift._creationTime,
    cancelled,
  };
}

/**
 * Countable hours per shift id. Only shifts that actually overlap another of
 * the same person need their event's status (a cancelled event never covers
 * time), so only those events are read. `cancelledByEventId` skips reads the
 * caller already made.
 */
export async function countableShiftHours(
  ctx: QueryCtx | MutationCtx,
  shifts: OverlapShiftDoc[],
  cancelledByEventId: ReadonlyMap<Id<"events">, boolean> = new Map(),
): Promise<Map<string, number>> {
  const overlapping = overlappingCrewShiftIds(shifts.map((shift) => toOverlapShift(shift)));
  const cancelled = new Map(cancelledByEventId);
  const toLoad = [
    ...new Set(
      shifts
        .filter((shift) => overlapping.has(shift._id) && !cancelled.has(shift.eventId))
        .map((shift) => shift.eventId),
    ),
  ];
  const events = await Promise.all(toLoad.map((eventId) => ctx.db.get(eventId)));
  toLoad.forEach((eventId, index) => {
    const event = events[index];
    cancelled.set(eventId, !event || normalizeEventStatus(event.status) === "cancelled");
  });
  return crewCountableHours(
    shifts.map((shift) => toOverlapShift(shift, cancelled.get(shift.eventId) === true)),
  );
}

/**
 * One person's shifts starting in `[from, to]`, plus the ones just before
 * `from` that could still cover part of them. Callers count only the shifts
 * that start in the window; the earlier ones are there so the shared time is
 * already taken.
 */
export async function loadUserShiftsWithLookback(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  from: number,
  to: number,
  cap = USER_SHIFT_READ_CAP,
) {
  return await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q.eq("userId", userId).gte("startsAt", from - CREW_OVERLAP_LOOKBACK_MS).lte("startsAt", to),
    )
    .take(cap);
}

/** People per event whose other-event shifts we read (mirrors the conflict check). */
const OTHER_EVENT_USER_CAP = 80;
/** One person's shifts read around one event. */
const OTHER_EVENT_SHIFTS_PER_USER = 50;

/**
 * The assigned people's shifts on other events that overlap their shifts on
 * this event. Indexed per person around their own shifts here, bounded.
 */
export async function loadOverlappingOtherEventShifts(
  ctx: QueryCtx | MutationCtx,
  eventIds: ReadonlySet<Id<"events">>,
  shifts: Array<Pick<OverlapShiftDoc, "userId" | "startsAt" | "endsAt">>,
): Promise<Array<Doc<"eventCrewShifts">>> {
  const byUser = new Map<string, Array<{ startsAt: number; endsAt: number }>>();
  for (const shift of shifts) {
    const userId = shift.userId?.trim();
    if (!userId || shift.endsAt <= shift.startsAt) continue;
    byUser.set(userId, [...(byUser.get(userId) ?? []), shift]);
  }
  const users = [...byUser.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, OTHER_EVENT_USER_CAP);
  const perUser = await Promise.all(
    users.map(async ([userId, own]) => {
      const from = Math.min(...own.map((shift) => shift.startsAt));
      const to = Math.max(...own.map((shift) => shift.endsAt));
      const rows = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_userId_and_startsAt", (q) =>
          q.eq("userId", userId).gte("startsAt", from - CREW_OVERLAP_LOOKBACK_MS).lt("startsAt", to),
        )
        .take(OTHER_EVENT_SHIFTS_PER_USER);
      return rows.filter(
        (row) =>
          !eventIds.has(row.eventId) &&
          own.some((shift) => row.endsAt > shift.startsAt && row.startsAt < shift.endsAt),
      );
    }),
  );
  return perUser.flat();
}
