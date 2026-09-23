import { v } from "convex/values";

/**
 * Event "needs" — what an event requires. Distinct from user verticals /
 * disciplines (`userVerticals.ts`, who a member is).
 */
export const EVENT_TEAMS = [
  "Design",
  "Photography",
  "Videography",
  "Sound",
  "Lighting",
  "Promotion",
  "Trivia",
  "Operations",
] as const;
export type EventTeam = (typeof EVENT_TEAMS)[number];

export const eventTeamValue = v.union(
  v.literal("Design"),
  v.literal("Photography"),
  v.literal("Videography"),
  v.literal("Sound"),
  v.literal("Lighting"),
  v.literal("Promotion"),
  v.literal("Trivia"),
  v.literal("Operations"),
);

/**
 * Retired umbrella need. "Promotion" (flyering / outreach) is its successor;
 * poster design moved to the concrete "Design" need.
 */
export const LEGACY_MARKETING_EVENT_TEAM = "Marketing";

function normalizeEventTeam(team: string): EventTeam | undefined {
  if (team === LEGACY_MARKETING_EVENT_TEAM) return "Promotion";
  return (EVENT_TEAMS as readonly string[]).includes(team) ? (team as EventTeam) : undefined;
}

/** Map stored teams to the current vocabulary, preserving order and dropping unknown/duplicate values. */
export function migrateEventTeams(teams: readonly string[] | undefined): EventTeam[] | undefined {
  if (!teams?.length) return undefined;
  const out: EventTeam[] = [];
  for (const team of teams) {
    const normalized = normalizeEventTeam(team);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out.length > 0 ? out : undefined;
}

/** True when `stored` already matches the migrated vocabulary exactly. */
export function eventTeamsAreCurrent(
  stored: readonly string[] | undefined,
  migrated: readonly EventTeam[] | undefined,
): boolean {
  const current = stored ?? [];
  const next = migrated ?? [];
  return current.length === next.length && next.every((team, index) => team === current[index]);
}
