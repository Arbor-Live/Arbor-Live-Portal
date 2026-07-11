import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Open Mic runner is open from this long before event start until this long after event end. */
export const OPEN_MIC_RUNNER_PAD_MS = 60 * 60 * 1000;

export type RunnerWindow = { opensAt: number; closesAt: number };

export function runnerWindowFor(startAt: number, endAt: number): RunnerWindow {
  return { opensAt: startAt - OPEN_MIC_RUNNER_PAD_MS, closesAt: endAt + OPEN_MIC_RUNNER_PAD_MS };
}

export function runnerWindowOpenAt(startAt: number, endAt: number, now: number): boolean {
  const window = runnerWindowFor(startAt, endAt);
  return now >= window.opensAt && now <= window.closesAt;
}

export function windowsOverlap(a: RunnerWindow, b: RunnerWindow): boolean {
  return a.opensAt < b.closesAt && b.opensAt < a.closesAt;
}

/** Reject the Open Mic add-on when its runner window overlaps another enabled
 *  event's runner window. One crew can only run one Open Mic at a time, so the
 *  bookable runner windows must never collide. */
export async function assertNoOpenMicOverlap(
  ctx: MutationCtx,
  eventId: Id<"events"> | null,
  startAt: number,
  endAt: number,
): Promise<void> {
  if (endAt <= startAt) return;
  const mine = runnerWindowFor(startAt, endAt);
  const others = await ctx.db
    .query("events")
    .withIndex("by_openMicEnabled_and_startAt", (q) => q.eq("openMicEnabled", true))
    .take(500);
  const conflict = others.find((other) => {
    if (eventId && other._id === eventId) return false;
    return windowsOverlap(mine, runnerWindowFor(other.startAt, other.endAt));
  });
  if (conflict) {
    throw new Error(
      `Open Mic window overlaps with "${conflict.title}" (${new Date(
        conflict.startAt,
      ).toLocaleString()}). Runner windows (1h before start to 1h after end) can't overlap.`,
    );
  }
}