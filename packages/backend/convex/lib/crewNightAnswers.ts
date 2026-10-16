import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { eventMatchesUserTeams } from "./crewTeams";
import {
  deriveEventResponse,
  nightKeyForEvent,
  type DerivedEventResponse,
  type NightAnswer,
} from "./crewNights";
import {
  getDisciplinesForEventMatching,
  profileHasCrewSpecialty,
  resolveProfileMembership,
} from "./userVerticals";

/**
 * Staff-side compatibility layer: each event reads the night answers of its
 * night (`by_nightKey`) and turns them into the old per-event answer shape.
 */

/** People answering one night. Crew is a few dozen people; 500 is a safety valve. */
const NIGHT_ROWS_TAKE = 500;

export type NightRow = Doc<"crewAvailabilityNights">;

export type EventNightResponse = DerivedEventResponse & { userId: string };

export function nightRowAnswer(row: NightRow): NightAnswer {
  return {
    status: row.status,
    windows: row.windows,
    notes: row.notes,
    respondedAt: row.respondedAt,
  };
}

export async function loadNightRows(ctx: Pick<QueryCtx, "db">, nightKey: string) {
  return await ctx.db
    .query("crewAvailabilityNights")
    .withIndex("by_nightKey", (q) => q.eq("nightKey", nightKey))
    .take(NIGHT_ROWS_TAKE);
}

/** Night rows for several nights, one indexed read per distinct night. */
export async function loadNightRowsByKey(ctx: Pick<QueryCtx, "db">, nightKeys: Iterable<string>) {
  const keys = [...new Set(nightKeys)];
  const pages = await Promise.all(keys.map((key) => loadNightRows(ctx, key)));
  return new Map(keys.map((key, index) => [key, pages[index] ?? []]));
}

type ProfileForMatch = Pick<
  Doc<"userAdminProfiles">,
  "userId" | "teams" | "verticals" | "disciplines" | "cartEligible"
>;

/** Whether this person would have been asked about the event (crew specialty + its teams). */
export function profileMatchesEvent(profile: ProfileForMatch | null | undefined, event: Doc<"events">) {
  if (!profile || !profileHasCrewSpecialty(profile)) return false;
  return eventMatchesUserTeams(
    event.teamsInterested,
    getDisciplinesForEventMatching(resolveProfileMembership(profile).disciplines),
  );
}

/** Profiles for the people on these night rows (one indexed read each). */
export async function loadProfilesForRows(
  ctx: Pick<QueryCtx, "db">,
  rows: NightRow[],
  known?: ReadonlyMap<string, ProfileForMatch>,
) {
  const byUserId = new Map<string, ProfileForMatch>(known ?? []);
  const missing = [...new Set(rows.map((row) => row.userId))].filter((userId) => !byUserId.has(userId));
  const fetched = await Promise.all(
    missing.map((userId) =>
      ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
    ),
  );
  for (const profile of fetched) {
    if (profile) byUserId.set(profile.userId, profile);
  }
  return byUserId;
}

/**
 * Each matching person's answer for one event, derived from their night.
 * People whose crew teams don't match the event were never asked about it, so
 * their night doesn't show up as an answer here.
 */
export function deriveEventResponses(
  event: Doc<"events">,
  blocks: Doc<"eventScheduleBlocks">[],
  rows: NightRow[],
  profiles: ReadonlyMap<string, ProfileForMatch>,
): EventNightResponse[] {
  const responses: EventNightResponse[] = [];
  for (const row of rows) {
    if (!profileMatchesEvent(profiles.get(row.userId), event)) continue;
    const derived = deriveEventResponse(nightRowAnswer(row), event, blocks);
    if (derived) responses.push({ ...derived, userId: row.userId });
  }
  return responses;
}

/** Load blocks + night rows + profiles and derive every answer for one event. */
export async function loadEventNightResponses(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
  blocks?: Doc<"eventScheduleBlocks">[],
) {
  const [eventBlocks, rows] = await Promise.all([
    blocks
      ? Promise.resolve(blocks)
      : ctx.db
          .query("eventScheduleBlocks")
          .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
          .take(200),
    loadNightRows(ctx, nightKeyForEvent(event)),
  ]);
  const profiles = await loadProfilesForRows(ctx, rows);
  return deriveEventResponses(event, eventBlocks, rows, profiles);
}

/**
 * People holding a slot only as a backup for this event: their night answer
 * is "Backup". Backup doesn't depend on the event's times, so no blocks needed.
 */
export async function loadBackupUserIds(
  ctx: Pick<QueryCtx, "db">,
  eventOrId: Doc<"events"> | Id<"events">,
) {
  const event = typeof eventOrId === "string" ? await ctx.db.get(eventOrId) : eventOrId;
  if (!event) return new Set<string>();
  const rows = (await loadNightRows(ctx, nightKeyForEvent(event))).filter((row) => row.status === "backup");
  if (rows.length === 0) return new Set<string>();
  const profiles = await loadProfilesForRows(ctx, rows);
  return new Set(rows.filter((row) => profileMatchesEvent(profiles.get(row.userId), event)).map((row) => row.userId));
}
