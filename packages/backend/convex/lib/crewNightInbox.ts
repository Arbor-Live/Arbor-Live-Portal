import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listCrewedEventsInRange } from "./crewedEvents";
import { eventMatchesUserTeams } from "./crewTeams";
import { nightKeyForEvent } from "./crewNights";
import { getDisciplinesForEventMatching, resolveProfileMembership } from "./userVerticals";

/** One person's nights in a window. Three weeks of nights is ~21; 12 weeks ~84. */
const MY_NIGHT_ROWS_TAKE = 200;

export function weeksToMs(weeks: number) {
  return weeks * 7 * 24 * 60 * 60 * 1000;
}

/**
 * Crewed events in `[now, windowEnd]` that match this person's crew teams,
 * grouped by night (soonest first). Nights without events never appear.
 */
export async function loadMyEventNights(
  ctx: QueryCtx,
  profile: Pick<Doc<"userAdminProfiles">, "teams" | "verticals" | "disciplines"> | null,
  now: number,
  windowEnd: number,
) {
  const disciplines = getDisciplinesForEventMatching(resolveProfileMembership(profile ?? {}).disciplines);
  const events = (await listCrewedEventsInRange(ctx, now, windowEnd)).filter((event) =>
    eventMatchesUserTeams(event.teamsInterested, disciplines),
  );
  const byNight = new Map<string, Doc<"events">[]>();
  for (const event of events) {
    const key = nightKeyForEvent(event);
    byNight.set(key, [...(byNight.get(key) ?? []), event]);
  }
  return [...byNight.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nightKey, nightEvents]) => ({ nightKey, events: nightEvents }));
}

/** This person's night rows between two night keys (inclusive). */
export async function loadMyNightRows(ctx: QueryCtx, userId: string, fromKey: string, toKey: string) {
  return await ctx.db
    .query("crewAvailabilityNights")
    .withIndex("by_userId_and_nightKey", (q) =>
      q.eq("userId", userId).gte("nightKey", fromKey).lte("nightKey", toKey),
    )
    .take(MY_NIGHT_ROWS_TAKE);
}

/** Nights with events for this person that they haven't answered yet. */
export async function listMyPendingNights(
  ctx: QueryCtx,
  userId: string,
  profile: Pick<Doc<"userAdminProfiles">, "teams" | "verticals" | "disciplines"> | null,
  now: number,
  windowEnd: number,
) {
  const nights = await loadMyEventNights(ctx, profile, now, windowEnd);
  if (nights.length === 0) return [];
  const rows = await loadMyNightRows(ctx, userId, nights[0]!.nightKey, nights[nights.length - 1]!.nightKey);
  const answered = new Set(rows.map((row) => row.nightKey));
  return nights.filter((night) => !answered.has(night.nightKey));
}
