/**
 * Who works which crew shifts, and which of their hours run past a full day.
 * Shared by the quote editor (crew lines) and the backend (event crew cost) so
 * both bill a day the same way.
 *
 * Open slots assume the same people stay on: within one day and role, the
 * first open slot of every section is one person, the second open slot is a
 * second person, and so on. 2 on setup, 2 on the show and 3 on strike is two
 * people working all three sections plus one on strike only. Nobody works two
 * slots at once, so an early setup crew who leave while setup is still running
 * are other people than the setup crew. Assigned crew are matched by who they
 * are. Only scheduled hours count: a gap between sections isn't paid. A
 * person on two overlapping shifts (here or on another event) counts the shared
 * time once, on the shift that starts first (`crewCountableHours`).
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
  /** Without hours a slot is never treated as overlapping another. */
  hours?: number;
};

const HOUR_MS = 3_600_000;

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
  // Section by section, each open slot goes to whoever on that day and role
  // finished most recently and isn't still working; else a new person starts.
  const peopleByRole = new Map<string, Array<{ key: string; endsAt: number }>>();
  const groups = [...openBySection.values()].sort((a, b) => a.sectionStartsAt - b.sectionStartsAt);
  for (const group of groups) {
    const poolKey = `${group.day}\u0000${group.role}`;
    const pool = peopleByRole.get(poolKey) ?? [];
    peopleByRole.set(poolKey, pool);
    const taken = new Set<string>();
    const ordered = [...group.shifts].sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));
    for (const shift of ordered) {
      const endsAt = shift.startsAt + Math.max(0, shift.hours ?? 0) * HOUR_MS;
      let person: { key: string; endsAt: number } | undefined;
      for (const candidate of pool) {
        if (taken.has(candidate.key) || candidate.endsAt > shift.startsAt) continue;
        if (!person || candidate.endsAt > person.endsAt) person = candidate;
      }
      if (person) person.endsAt = Math.max(person.endsAt, endsAt);
      else {
        person = { key: `open:${group.day}:${group.role}:${pool.length}`, endsAt };
        pool.push(person);
      }
      taken.add(person.key);
      keys.set(shift.id, person.key);
    }
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

/**
 * How far back to read a person's other shifts so every shift that could
 * overlap one starting at a given time is seen (no shift runs past a day).
 */
export const CREW_OVERLAP_LOOKBACK_MS = 24 * HOUR_MS;

export type CrewOverlapShift = {
  id: string;
  /** Only assigned crew are deduplicated; open slots have no person to match. */
  userId?: string;
  startsAt: number;
  endsAt: number;
  /** Stored hours (may be custom); the countable hours never exceed it. */
  hours: number;
  /** `_creationTime`: ties on start go to the earlier-created shift. Unset = not saved yet (newest). */
  createdAt?: number;
  /** A cancelled event's shift never covers anyone's time; its own hours are left as stored. */
  cancelled?: boolean;
};

function overlapOrder(a: CrewOverlapShift, b: CrewOverlapShift) {
  return (
    a.startsAt - b.startsAt ||
    (a.createdAt ?? Number.POSITIVE_INFINITY) - (b.createdAt ?? Number.POSITIVE_INFINITY) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function shiftsByPerson(shifts: CrewOverlapShift[]) {
  const byUser = new Map<string, CrewOverlapShift[]>();
  for (const shift of shifts) {
    const userId = shift.userId?.trim();
    if (!userId) continue;
    const list = byUser.get(userId) ?? [];
    list.push(shift);
    byUser.set(userId, list);
  }
  return byUser;
}

/**
 * Hours each shift counts once a person's overlapping shifts are counted only
 * once. Time two shifts share belongs to the one that starts first (ties: the
 * earlier-created one); a later shift counts `hours − time already covered`,
 * never below zero. Covered time is the union of earlier shifts, so a three-way
 * overlap still counts once. Applies across events and within one event; open
 * slots and shifts with no overlap keep their stored hours.
 */
export function crewCountableHours(shifts: CrewOverlapShift[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const shift of shifts) result.set(shift.id, Math.max(0, shift.hours));
  for (const personShifts of shiftsByPerson(shifts).values()) {
    if (personShifts.length < 2) continue;
    // Merged, sorted intervals already counted by earlier shifts.
    let covered: Array<[number, number]> = [];
    for (const shift of [...personShifts].sort(overlapOrder)) {
      if (shift.endsAt <= shift.startsAt || shift.cancelled) continue;
      let overlapMs = 0;
      for (const [from, to] of covered) {
        overlapMs += Math.max(0, Math.min(to, shift.endsAt) - Math.max(from, shift.startsAt));
      }
      if (overlapMs > 0) result.set(shift.id, round2(Math.max(0, shift.hours - overlapMs / HOUR_MS)));
      covered = mergeInterval(covered, [shift.startsAt, shift.endsAt]);
    }
  }
  return result;
}

/** Ids of assigned shifts that overlap another shift of the same person (cheap pre-check). */
export function overlappingCrewShiftIds(shifts: CrewOverlapShift[]): Set<string> {
  const ids = new Set<string>();
  for (const personShifts of shiftsByPerson(shifts).values()) {
    const ordered = [...personShifts].filter((shift) => shift.endsAt > shift.startsAt).sort(overlapOrder);
    let latest: CrewOverlapShift | undefined;
    for (const shift of ordered) {
      if (latest && shift.startsAt < latest.endsAt) {
        ids.add(shift.id);
        ids.add(latest.id);
      }
      if (!latest || shift.endsAt > latest.endsAt) latest = shift;
    }
  }
  return ids;
}

function mergeInterval(intervals: Array<[number, number]>, next: [number, number]): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  let [from, to] = next;
  for (const [start, end] of intervals) {
    if (end < from || start > to) merged.push([start, end]);
    else {
      from = Math.min(from, start);
      to = Math.max(to, end);
    }
  }
  merged.push([from, to]);
  return merged.sort((a, b) => a[0] - b[0]);
}
