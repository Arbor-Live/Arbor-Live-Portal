import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { eventGroupKind, type EventGroupKind } from "./eventGroupKind";

/**
 * Which days an invoice artist line applies to. A line tagged to a day
 * (`eventId`) applies to that day. An unscoped line's reach comes from the
 * event group that owns the invoice's days (no guessing from the events):
 *
 * - a recurring series: every occurrence (the resident act plays each week);
 * - a multi-day booking, or days without a group: the first day, as quotes
 *   have always read it. Staff pick a day per line on multi-day quotes.
 */
export type ArtistLineDayScope = {
  firstEventId?: Id<"events">;
  unscopedAppliesToEveryDay: boolean;
};

/**
 * Build artist-line scope from days already in calendar order and their shared
 * group kind. Only recurring groups apply unscoped lines to every day; other
 * kinds use the first supplied day, or no fallback when the list is empty.
 */
export function artistLineDayScope(
  events: ReadonlyArray<Pick<Doc<"events">, "_id" | "seriesId">>,
  owningGroupKind: EventGroupKind | null,
): ArtistLineDayScope {
  return {
    firstEventId: events[0]?._id,
    unscopedAppliesToEveryDay: owningGroupKind === "recurring",
  };
}

/** The group every day belongs to, or null when days are ungrouped or mixed. */
export function sharedGroupId(
  events: ReadonlyArray<Pick<Doc<"events">, "seriesId">>,
): Id<"eventSeries"> | null {
  const groupId = events[0]?.seriesId;
  if (groupId === undefined) return null;
  return events.every((event) => event.seriesId === groupId) ? groupId : null;
}

/**
 * Resolve unscoped artist lines to every day only when all supplied events
 * share an existing recurring group; otherwise they apply to the first event.
 * `events` must be the invoice's primary days in calendar order. A missing
 * group falls back to the first day; database read errors propagate.
 */
export async function resolveArtistLineDayScope(
  ctx: QueryCtx | MutationCtx,
  events: ReadonlyArray<Doc<"events">>,
): Promise<ArtistLineDayScope> {
  const groupId = sharedGroupId(events);
  const group = groupId ? await ctx.db.get(groupId) : null;
  return artistLineDayScope(events, group ? eventGroupKind(group) : null);
}

/**
 * Match an explicitly scoped line only to its event; otherwise use the scope's
 * all-days flag or first event. With no first event and no all-days flag, an
 * unscoped line matches nothing.
 */
export function artistLineAppliesToEvent(args: {
  lineEventId?: Id<"events">;
  eventId: Id<"events">;
  scope: ArtistLineDayScope;
}): boolean {
  if (args.lineEventId) return args.lineEventId === args.eventId;
  return args.scope.unscopedAppliesToEveryDay || args.scope.firstEventId === args.eventId;
}
