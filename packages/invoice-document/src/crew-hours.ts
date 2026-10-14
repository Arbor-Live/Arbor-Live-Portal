/**
 * Who works which crew shifts, and which of their hours run past a full day.
 * Shared by the quote editor (crew lines) and the backend (event crew cost) so
 * both bill a day the same way.
 *
 * Open slots assume the same people stay on: within one day and role, the
 * first open slot of every section is one person, the second open slot is a
 * second person, and so on. 2 on setup, 2 on the show and 3 on strike is two
 * people working all three sections plus one on strike only. Assigned crew are
 * matched by who they are. Only scheduled hours count: a gap between sections
 * isn't paid.
 */

/** Hours a person works in a day at their regular multiple; the rest bill as overtime. */
export const CREW_REGULAR_HOURS_PER_DAY = 8;

export type CrewHoursTier = "regular" | "past_regular";

/**
 * Multiples of a person's rate. A normal day: 1× up to 8 hrs, 1.5× after. A
 * day marked OT: 1.5× up to 8 hrs, double time after.
 */
export function crewTierMultiplier(tier: CrewHoursTier, otDay: boolean) {
  if (tier === "regular") return otDay ? 1.5 : 1;
  return otDay ? 2 : 1.5;
}

/** The label tag a crew line at this tier carries (read back by `parseCrewLine`). */
export function crewTierTag(tier: CrewHoursTier, otDay: boolean) {
  if (tier === "regular") return otDay ? " · OT" : "";
  return `${otDay ? " · DT" : " · OT"} after ${CREW_REGULAR_HOURS_PER_DAY} hrs`;
}

export type CrewShiftForPeople = {
  id: string;
  /** Calendar day or event day the shift belongs to; people never span days. */
  day: string;
  /** The Run of Show section; slots in the same section are different people. */
  sectionRef: string;
  sectionStartsAt: number;
  role: string;
  userId?: string;
  startsAt: number;
};

function roleKey(role: string) {
  return role.trim().toLowerCase();
}

/** Each shift's person: `user:<id>` for assigned crew, `open:<day>:<role>:<n>` for open slots. */
export function crewPersonKeys(shifts: CrewShiftForPeople[]): Map<string, string> {
  const keys = new Map<string, string>();
  const openBySection = new Map<string, { day: string; role: string; sectionStartsAt: number; shifts: CrewShiftForPeople[] }>();
  for (const shift of shifts) {
    if (shift.userId) {
      keys.set(shift.id, `user:${shift.day}:${shift.userId}`);
      continue;
    }
    const role = roleKey(shift.role);
    const groupKey = `${shift.day}\u0000${role}\u0000${shift.sectionRef}`;
    const group = openBySection.get(groupKey);
    if (group) group.shifts.push(shift);
    else openBySection.set(groupKey, { day: shift.day, role, sectionStartsAt: shift.sectionStartsAt, shifts: [shift] });
  }
  for (const group of openBySection.values()) {
    const ordered = [...group.shifts].sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));
    ordered.forEach((shift, index) => keys.set(shift.id, `open:${group.day}:${group.role}:${index}`));
  }
  return keys;
}

/**
 * Splits each shift's hours into regular and past-a-full-day hours, filling a
 * person's day in shift order.
 */
export function allocateCrewHours(
  shifts: Array<{ id: string; personKey: string; startsAt: number; hours: number }>,
): Map<string, { regularHours: number; pastRegularHours: number }> {
  const worked = new Map<string, number>();
  const result = new Map<string, { regularHours: number; pastRegularHours: number }>();
  const ordered = [...shifts].sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));
  for (const shift of ordered) {
    const hours = Math.max(0, shift.hours);
    const before = worked.get(shift.personKey) ?? 0;
    const regularHours = round2(Math.max(0, Math.min(hours, CREW_REGULAR_HOURS_PER_DAY - before)));
    result.set(shift.id, { regularHours, pastRegularHours: round2(hours - regularHours) });
    worked.set(shift.personKey, before + hours);
  }
  return result;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
