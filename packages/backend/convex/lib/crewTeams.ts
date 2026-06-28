/** Event types that require crew availability responses. */
export const CREWED_EVENT_TYPES = new Set(["Crewed Event", "Rental with Crew"]);

/** Default availability window (weeks) for crew member inbox. */
export const DEFAULT_AVAILABILITY_WEEKS = 3;

/** Extended window when crew opts to "show more". */
export const EXTENDED_AVAILABILITY_WEEKS = 12;

/** Default admin crew scheduling window (weeks). */
export const ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS = 2;

/** Map user profile team names to event teamInterested names. */
export function normalizeTeamForMatch(team: string): string {
  if (team === "Lights") return "Lighting";
  return team;
}

export function normalizeTeamsForMatch(teams: string[]): Set<string> {
  return new Set(teams.map(normalizeTeamForMatch));
}

/**
 * True when the event's teamsInterested overlaps the user's teams.
 * Events with no teams set are visible to all active crew.
 */
export function eventMatchesUserTeams(
  eventTeams: string[] | undefined,
  userTeams: string[],
): boolean {
  if (!eventTeams || eventTeams.length === 0) return true;
  const normalizedUserTeams = normalizeTeamsForMatch(userTeams);
  return eventTeams.some((team) => normalizedUserTeams.has(normalizeTeamForMatch(team)));
}

export function isCrewedEventType(eventType: string | undefined): boolean {
  return Boolean(eventType && CREWED_EVENT_TYPES.has(eventType));
}
