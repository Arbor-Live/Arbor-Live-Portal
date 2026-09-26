import { v } from "convex/values";

export const USER_VERTICALS = ["Operations", "Crew", "Trivia", "Marketing"] as const;
export type UserVertical = (typeof USER_VERTICALS)[number];

export const USER_DISCIPLINES = [
  "Sound",
  "Lights",
  "Design",
  "Photography",
  "Videography",
] as const;
export type UserDiscipline = (typeof USER_DISCIPLINES)[number];

/** Disciplines a member may hold for each vertical. */
export const DISCIPLINES_BY_VERTICAL: Record<UserVertical, readonly UserDiscipline[]> = {
  Operations: [],
  Crew: ["Sound", "Lights", "Photography", "Videography"],
  Trivia: [],
  Marketing: ["Design", "Photography", "Videography"],
};

/**
 * Disciplines that put a member on event shifts: they fill availability and
 * show up as eligible crew. Design (Marketing-only) and the verticals with no
 * specialties (Operations, Trivia) are excluded.
 */
export const CREW_DISCIPLINES = ["Sound", "Lights", "Photography", "Videography"] as const;
export type CrewDiscipline = (typeof CREW_DISCIPLINES)[number];

const CREW_DISCIPLINE_SET = new Set<string>(CREW_DISCIPLINES);

export function isCrewDiscipline(value: string): value is CrewDiscipline {
  return CREW_DISCIPLINE_SET.has(value);
}

export function getCrewDisciplines(disciplines: readonly UserDiscipline[]): CrewDiscipline[] {
  return disciplines.filter(isCrewDiscipline);
}

export function hasCrewSpecialty(disciplines: readonly UserDiscipline[]): boolean {
  return disciplines.some(isCrewDiscipline);
}

export function profileHasCrewSpecialty(profile: {
  teams?: readonly string[];
  verticals?: readonly string[];
  disciplines?: readonly string[];
}): boolean {
  return hasCrewSpecialty(resolveProfileMembership(profile).disciplines);
}

/** @deprecated Legacy team values stored before verticals migration. */
export const LEGACY_USER_TEAMS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;
export type LegacyUserTeam = (typeof LEGACY_USER_TEAMS)[number];

export const userVerticalValue = v.union(
  v.literal("Operations"),
  v.literal("Crew"),
  v.literal("Trivia"),
  v.literal("Marketing"),
);

export const userDisciplineValue = v.union(
  v.literal("Sound"),
  v.literal("Lights"),
  v.literal("Design"),
  v.literal("Photography"),
  v.literal("Videography"),
);

/** Every discipline available across the given verticals, in canonical order. */
export function disciplinesForVerticals(verticals: readonly UserVertical[]): UserDiscipline[] {
  const allowed = new Set<UserDiscipline>();
  for (const vertical of verticals) {
    for (const discipline of DISCIPLINES_BY_VERTICAL[vertical]) {
      allowed.add(discipline);
    }
  }
  return USER_DISCIPLINES.filter((discipline) => allowed.has(discipline));
}

export function invalidDisciplinesForVerticals(
  verticals: readonly UserVertical[],
  disciplines: readonly UserDiscipline[],
): UserDiscipline[] {
  const allowed = new Set(disciplinesForVerticals(verticals));
  return disciplines.filter((discipline) => !allowed.has(discipline));
}

export function assertDisciplinesMatchVerticals(
  verticals: readonly UserVertical[],
  disciplines: readonly UserDiscipline[],
): void {
  const invalid = invalidDisciplinesForVerticals(verticals, disciplines);
  if (invalid.length === 0) return;
  const verticalLabel = verticals.length > 0 ? verticals.join(", ") : "no vertical";
  throw new Error(
    `Discipline${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")} not available for ${verticalLabel}.`,
  );
}

export const PUBLIC_CREW_SECTION_ORDER = USER_VERTICALS;

export const PUBLIC_CREW_SECTION_LABELS: Record<UserVertical, string> = {
  Operations: "Operations",
  Crew: "Crew",
  Trivia: "Trivia",
  Marketing: "Marketing",
};

export function legacyTeamsToMembership(teams: readonly string[]): {
  verticals: UserVertical[];
  disciplines: UserDiscipline[];
} {
  const verticals = new Set<UserVertical>();
  const disciplines = new Set<UserDiscipline>();

  for (const team of teams) {
    switch (team) {
      case "Operations":
        verticals.add("Operations");
        break;
      case "Marketing":
        verticals.add("Marketing");
        break;
      case "Design":
        verticals.add("Marketing");
        disciplines.add("Design");
        break;
      case "Sound":
        verticals.add("Crew");
        disciplines.add("Sound");
        break;
      case "Lights":
        verticals.add("Crew");
        disciplines.add("Lights");
        break;
      default:
        break;
    }
  }

  return {
    verticals: USER_VERTICALS.filter((vertical) => verticals.has(vertical)),
    disciplines: USER_DISCIPLINES.filter((discipline) => disciplines.has(discipline)),
  };
}

export function resolveProfileMembership(profile: {
  teams?: readonly string[];
  verticals?: readonly string[];
  disciplines?: readonly string[];
}): { verticals: UserVertical[]; disciplines: UserDiscipline[] } {
  if (profile.verticals && profile.verticals.length > 0) {
    return {
      verticals: profile.verticals.filter((entry): entry is UserVertical =>
        (USER_VERTICALS as readonly string[]).includes(entry),
      ),
      disciplines: (profile.disciplines ?? []).filter((entry): entry is UserDiscipline =>
        (USER_DISCIPLINES as readonly string[]).includes(entry),
      ),
    };
  }
  return legacyTeamsToMembership(profile.teams ?? []);
}

export function getPrimaryVertical(verticals: readonly string[]): UserVertical | null {
  for (const vertical of PUBLIC_CREW_SECTION_ORDER) {
    if (verticals.includes(vertical)) return vertical;
  }
  return null;
}

export function getSecondaryTags(
  verticals: readonly UserVertical[],
  disciplines: readonly UserDiscipline[],
  primaryVertical: UserVertical | null,
): string[] {
  const tags = new Set<string>();
  for (const vertical of verticals) {
    if (vertical !== primaryVertical) tags.add(vertical);
  }
  for (const discipline of disciplines) {
    tags.add(discipline);
  }
  return [...tags];
}

export function hasVertical(verticals: readonly string[], vertical: UserVertical): boolean {
  return verticals.includes(vertical);
}

export function hasAnyVertical(
  verticals: readonly string[],
  candidates: readonly UserVertical[],
): boolean {
  return candidates.some((vertical) => verticals.includes(vertical));
}

export function isStaffMember(membership: {
  verticals: readonly UserVertical[];
  disciplines: readonly UserDiscipline[];
}): boolean {
  return membership.verticals.length > 0 || membership.disciplines.length > 0;
}

export function getDisciplinesForEventMatching(disciplines: readonly UserDiscipline[]): string[] {
  return [...getCrewDisciplines(disciplines)];
}
