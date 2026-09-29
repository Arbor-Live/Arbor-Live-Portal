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

/** Pure: the scope once the owning group (if every day shares one) is known. */
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

/** `events` are the invoice's primary days in calendar order. */
export async function resolveArtistLineDayScope(
  ctx: QueryCtx | MutationCtx,
  events: ReadonlyArray<Doc<"events">>,
): Promise<ArtistLineDayScope> {
  const groupId = sharedGroupId(events);
  const group = groupId ? await ctx.db.get(groupId) : null;
  return artistLineDayScope(events, group ? eventGroupKind(group) : null);
}

/** Whether an artist line applies to a given event. */
export function artistLineAppliesToEvent(args: {
  lineEventId?: Id<"events">;
  eventId: Id<"events">;
  scope: ArtistLineDayScope;
}): boolean {
  if (args.lineEventId) return args.lineEventId === args.eventId;
  return args.scope.unscopedAppliesToEveryDay || args.scope.firstEventId === args.eventId;
}
