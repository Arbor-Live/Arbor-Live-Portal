import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The days of an event group and which of them an apply reaches. The single
 * scope rule for every group edit (templates, overview fields, invoice).
 *
 * Scopes: `all` days, `future` (this day on, skipping days already past), or
 * `this` day only. Detached (overridden) and cancelled days are always skipped.
 */

export type GroupApplyScope = "this" | "future" | "all";

/**
 * Days read per group. Matches the 200-occurrence caps the series code has
 * always used (a weekly series is ~4 years at 200); real bookings are a handful.
 */
const MAX_GROUP_DAYS = 200;

type GroupDay = Pick<
  Doc<"events">,
  "_id" | "startAt" | "status" | "occurrenceIndex" | "seriesDetached" | "seriesId"
>;

export async function listGroupDays(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"eventSeries">,
): Promise<Doc<"events">[]> {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", groupId))
    .take(MAX_GROUP_DAYS);
  return rows.sort(
    (a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0) || a.startAt - b.startAt,
  );
}

/**
 * Which days an apply reaches. `referenceIndex` is the day the user picked
 * (0-based `occurrenceIndex`). Pure, so the scope rules are unit-tested.
 */
export function selectDaysInScope<T extends GroupDay>(
  days: readonly T[],
  scope: GroupApplyScope,
  referenceIndex: number,
  now: number,
): T[] {
  return days.filter((day) => {
    if (day.seriesDetached || day.status === "cancelled") return false;
    const index = day.occurrenceIndex ?? 0;
    if (scope === "this") return index === referenceIndex;
    if (scope === "all") return true;
    return index >= referenceIndex && day.startAt >= now;
  });
}
