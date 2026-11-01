import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Bounds the shift scan: shifts longer than this, or with a call time this far
 * before their start, are not considered.
 */
const CREW_SHIFT_MAX_SPAN_MS = 24 * 60 * 60 * 1000;

/** Cap shifts scanned when deciding what the viewer is working. */
const CREW_SHIFT_SCAN_CAP = 50;

/** How long before and after a shift it counts as the viewer's current shift. */
export const ON_SHIFT_PADDING_MS = 60 * 60 * 1000;

export type OnShiftPhase = "upcoming" | "now" | "ended";

const PHASE_ORDER: Record<OnShiftPhase, number> = { now: 0, upcoming: 1, ended: 2 };

type ShiftRange = { startsAt: number; endsAt: number };

/**
 * A user's shifts that could overlap `now` once padded. Indexed on `startsAt`,
 * so a shift still running is only reachable by looking back a full shift span.
 */
export async function listUserShiftsNear(
  ctx: QueryCtx,
  userId: string,
  now: number,
  paddingMs: number,
): Promise<Doc<"eventCrewShifts">[]> {
  return await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q
        .eq("userId", userId)
        .gte("startsAt", now - CREW_SHIFT_MAX_SPAN_MS - paddingMs)
        .lte("startsAt", now + CREW_SHIFT_MAX_SPAN_MS + paddingMs),
    )
    .take(CREW_SHIFT_SCAN_CAP);
}

/** Where `now` sits against a shift, or null when it is outside the padded window. */
export function onShiftPhase({ startsAt, endsAt }: ShiftRange, now: number): OnShiftPhase | null {
  if (now < startsAt - ON_SHIFT_PADDING_MS || now > endsAt + ON_SHIFT_PADDING_MS) return null;
  if (now < startsAt) return "upcoming";
  return now > endsAt ? "ended" : "now";
}

/**
 * One row per event for the shifts inside the padded window, spanning the
 * earliest call or start to the latest end, with shifts in progress first, then what is
 * coming up, then what just ended, soonest first within each.
 */
export function summarizeOnShiftEvents(
  shifts: readonly (ShiftRange & { eventId: Id<"events">; callTime?: number })[],
  now: number,
) {
  const ranges = new Map<Id<"events">, ShiftRange>();
  for (const { eventId, callTime, startsAt: shiftStart, endsAt } of shifts) {
    // Crew called in early are on shift from the call, not the listed start.
    const startsAt = Math.min(callTime ?? shiftStart, shiftStart);
    if (!onShiftPhase({ startsAt, endsAt }, now)) continue;
    const range = ranges.get(eventId);
    ranges.set(eventId, {
      startsAt: Math.min(startsAt, range?.startsAt ?? startsAt),
      endsAt: Math.max(endsAt, range?.endsAt ?? endsAt),
    });
  }
  return [...ranges]
    .flatMap(([eventId, range]) => {
      const phase = onShiftPhase(range, now);
      return phase ? [{ eventId, ...range, phase }] : [];
    })
    .sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.startsAt - b.startsAt);
}
