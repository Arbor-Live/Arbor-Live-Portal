import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { eventMatchesUserTeams, isCrewedEventType } from "./crewTeams";
import { loadAdminProfilesByStatus } from "./userProfiles";
import { resolveParticipationFlags } from "./userParticipation";
import {
  getDisciplinesForEventMatching,
  hasCrewSpecialty,
  resolveProfileMembership,
} from "./userVerticals";
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

/** Active, crew-assignable profiles with a crew specialty. */
export async function getActiveCrewProfiles(ctx: QueryCtx) {
  // `status` is set on every insert and backfilled for older rows
  // (`backfillUserProfileStatus`), so the `by_status` index is the whole live
  // roster — see `loadAdminProfilesByStatus` for the one caveat.
  const profiles = await loadAdminProfilesByStatus(ctx, ["active"]);
  return profiles.filter((profile) => {
    if (!resolveParticipationFlags(profile).assignableAsCrew) return false;
    return hasCrewSpecialty(resolveProfileMembership(profile).disciplines);
  });
}

/** Crew whose disciplines match the event's teams of interest. */
export function eligibleCrewProfilesForEvent(
  eventTeams: string[] | undefined,
  profiles: Doc<"userAdminProfiles">[],
) {
  return profiles.filter((profile) =>
    eventMatchesUserTeams(
      eventTeams,
      getDisciplinesForEventMatching(resolveProfileMembership(profile).disciplines),
    ),
  );
}
