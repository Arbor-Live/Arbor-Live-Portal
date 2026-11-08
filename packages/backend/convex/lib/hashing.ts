import {
  addDaysToDateKey,
  mondayOf,
  quarterWeek,
  STANFORD_QUARTERS,
  stanfordCurrentOrNextQuarter,
  stanfordQuarterOffset,
  weekdayOf,
  type AcademicQuarter,
} from "@arbor/format";
import type { ChecklistTree, HashBookingStatus, HashDateStatus, HashStanding } from "./hashingValues";

export const HASHING_DEFAULTS = {
  weekday: 2,
  startTime: "16:00",
  durationMinutes: 60,
  spotsPerHash: 3,
  location: "The closet",
} as const;

/** The quarter hashing is working on: in session, else the next. Summer has no requirement. */
export function hashingQuarterFor(dateKey: string): AcademicQuarter | null {
  const quarter = stanfordCurrentOrNextQuarter(dateKey);
  return quarter?.term === "summer" ? followingHashingQuarter(quarter) : quarter;
}

export function followingHashingQuarter(quarter: AcademicQuarter): AcademicQuarter | null {
  const next = stanfordQuarterOffset(quarter, 1);
  return next?.term === "summer" ? stanfordQuarterOffset(next, 1) : next;
}

export function hashingQuarterById(quarterId: string): AcademicQuarter | null {
  return STANFORD_QUARTERS.find((quarter) => quarter.id === quarterId) ?? null;
}

/** The quarter a date belongs to, first day of classes through finals. Summer has no hashes. */
export function hashingQuarterContaining(dateKey: string): AcademicQuarter | null {
  return (
    STANFORD_QUARTERS.find(
      (quarter) => quarter.term !== "summer" && dateKey >= quarter.startDate && dateKey <= quarter.finalsEndDate,
    ) ?? null
  );
}

/** A week `quarterWeek` doesn't number (Thanksgiving, finals, a break) has no hash. */
export function isOffWeek(dateKey: string) {
  const week = quarterWeek(dateKey);
  return week !== null && week.kind !== "week";
}

/** Every `weekday` from `fromKey` through `toKey`, inclusive. */
export function regularDateKeys(args: { weekday: number; fromKey: string; toKey: string }) {
  const keys: string[] = [];
  const first = addDaysToDateKey(args.fromKey, (args.weekday - weekdayOf(args.fromKey) + 7) % 7);
  for (let key = first; key <= args.toKey; key = addDaysToDateKey(key, 7)) keys.push(key);
  return keys;
}

export type RegularRow<Id> = {
  id: Id;
  dateKey: string;
  movedFromDateKey?: string;
  /** Regular, not started, unmoved, still ahead: only these follow the setup. */
  shiftable: boolean;
};

/** A regular date holds its week even after it moves, so saving never re-creates it. */
function ownedWeek(row: { dateKey: string; movedFromDateKey?: string }) {
  return mondayOf(row.movedFromDateKey ?? row.dateKey);
}

/**
 * Reconcile a quarter's regular dates with the chosen weekday. Each week owns
 * one regular date: a shiftable date moves within its week, a week with no
 * date gets one, and a shiftable date whose week has no slot left (the new
 * weekday already passed this week) stays as it is, bookings and all.
 */
export function planRegularDates<Id>(args: {
  existing: readonly RegularRow<Id>[];
  weekday: number;
  fromKey: string;
  toKey: string;
}) {
  const targetByWeek = new Map(
    regularDateKeys(args).map((dateKey) => [mondayOf(dateKey), dateKey] as const),
  );
  const shift: { id: Id; dateKey: string }[] = [];
  const stay: Id[] = [];
  for (const row of args.existing) {
    if (!row.shiftable) continue;
    const target = targetByWeek.get(ownedWeek(row));
    if (!target) stay.push(row.id);
    else if (target !== row.dateKey) shift.push({ id: row.id, dateKey: target });
  }
  const ownedWeeks = new Set(args.existing.map(ownedWeek));
  const create = [...targetByWeek]
    .filter(([week]) => !ownedWeeks.has(week))
    .map(([, dateKey]) => ({ dateKey, off: isOffWeek(dateKey) }));
  return { create, shift, stay };
}

/**
 * The date passed and nobody started it, so it can't count as a booking any
 * more. The nightly close writes `lapsed`; until it runs, the date alone decides.
 */
export function isLapsed(row: { status: HashDateStatus; dateKey: string }, todayKey: string) {
  return row.status === "lapsed" || (row.status === "scheduled" && row.dateKey < todayKey);
}

/** Whether a booking still uses up the person's one spot this quarter. */
export function holdsQuarterSpot(
  booking: { status: HashBookingStatus },
  row: { status: HashDateStatus; dateKey: string },
  todayKey: string,
) {
  if (isLapsed(row, todayKey)) return false;
  return !(booking.status === "needs_confirmation" && row.status === "finished");
}

export type HashQuarterState = "done" | "exempt" | "booked" | "no_dates_work" | "needs_hash";

export function deriveQuarterState(args: {
  bookings: readonly { status: HashBookingStatus; hashStatus: HashDateStatus }[];
  standing: HashStanding["kind"] | null | undefined;
}): HashQuarterState {
  if (args.bookings.some((b) => b.status === "booked" && b.hashStatus === "finished")) return "done";
  if (args.standing === "exempt") return "exempt";
  if (args.bookings.some((b) => b.hashStatus !== "finished")) return "booked";
  if (args.standing === "no_dates_work") return "no_dates_work";
  return "needs_hash";
}

/**
 * Place people on the dates they said they can do. Hardest to place go first
 * (fewest "can" answers on dates with room), each on their earliest open date.
 * `openSpots` already excludes existing bookings, which stay as they are.
 */
export function fillFromAvailability<Person extends string, DateId extends string>(args: {
  /** Ties keep this order. */
  people: readonly Person[];
  /** Soonest first. */
  dates: readonly { id: DateId; openSpots: number }[];
  canAnswers: readonly { userId: Person; dateId: DateId }[];
}) {
  const open = new Map(args.dates.map((date) => [date.id, date.openSpots]));
  const order = new Map(args.dates.map((date, index) => [date.id, index]));
  const cansByPerson = new Map<Person, DateId[]>();
  for (const { userId, dateId } of args.canAnswers) {
    if ((open.get(dateId) ?? 0) <= 0) continue;
    cansByPerson.set(userId, [...(cansByPerson.get(userId) ?? []), dateId]);
  }
  const hardestFirst = [...new Set(args.people)]
    .map((userId) => ({ userId, cans: cansByPerson.get(userId) ?? [] }))
    .sort((a, b) => a.cans.length - b.cans.length);

  const placements: { userId: Person; dateId: DateId }[] = [];
  const unplaced: Person[] = [];
  for (const { userId, cans } of hardestFirst) {
    const dateId = [...cans]
      .sort((a, b) => order.get(a)! - order.get(b)!)
      .find((id) => (open.get(id) ?? 0) > 0);
    if (dateId === undefined) {
      unplaced.push(userId);
      continue;
    }
    open.set(dateId, open.get(dateId)! - 1);
    placements.push({ userId, dateId });
  }
  return { placements, unplaced };
}

export const FINAL_CHECKS_KIT = "final";

export function itemKeyOf(areaId: string, kitId: string, itemId: string) {
  return `${areaId}:${kitId}:${itemId}`;
}

/** The line id inside an item key. Ids are `[a-z0-9-]`, so it's whatever follows the last colon. */
export function lineIdOf(itemKey: string) {
  return itemKey.slice(itemKey.lastIndexOf(":") + 1);
}

export type ChecklistRow = { itemKey: string; text: string };
export type ChecklistAreaView = {
  id: string;
  name: string;
  kits: { id: string; name: string; rows: ChecklistRow[] }[];
  finalChecks: ChecklistRow[];
  total: number;
};

/** The tickable rows of a checklist, in order, limited to `areaIds` when set. */
export function flattenChecklist(tree: ChecklistTree, areaIds?: readonly string[]): ChecklistAreaView[] {
  const kitById = new Map(tree.kits.map((kit) => [kit.id, kit]));
  return tree.areas
    .filter((area) => !areaIds?.length || areaIds.includes(area.id))
    .map((area) => {
      const kits = area.placements.flatMap((placement) => {
        const kit = kitById.get(placement.kitId);
        if (!kit) return [];
        const rows = [...kit.items, ...placement.extraItems].map((item) => ({
          itemKey: itemKeyOf(area.id, kit.id, item.id),
          text: item.text,
        }));
        return [{ id: kit.id, name: kit.name, rows }];
      });
      const finalChecks = area.finalChecks.map((check) => ({
        itemKey: itemKeyOf(area.id, FINAL_CHECKS_KIT, check.id),
        text: check.text,
      }));
      const total = kits.reduce((sum, kit) => sum + kit.rows.length, finalChecks.length);
      return { id: area.id, name: area.name, kits, finalChecks, total };
    });
}

export const CHECKLIST_LIMITS = {
  areas: 20,
  kits: 60,
  /** Tickable rows on a whole hash. The seed has 140. */
  rows: 400,
  nameChars: 80,
  textChars: 240,
};

const ID_PATTERN = /^[a-z0-9-]{1,64}$/;

/** Everything wrong with a checklist about to be published, in plain words. */
export function checklistProblems(tree: ChecklistTree): string[] {
  const problems: string[] = [];
  const { areas, kits, nameChars, rows, textChars } = CHECKLIST_LIMITS;
  if (tree.areas.length === 0) problems.push("Add at least one area.");
  if (tree.areas.length > areas) problems.push(`Too many areas: max ${areas}, got ${tree.areas.length}.`);
  if (tree.kits.length > kits) problems.push(`Too many kits: max ${kits}, got ${tree.kits.length}.`);

  const checkId = (id: string, where: string) => {
    if (!ID_PATTERN.test(id)) problems.push(`${where} has an invalid id: ${id}.`);
  };
  const checkName = (name: string, what: string) => {
    if (!name.trim()) problems.push(`${what} needs a name.`);
    if (name.length > nameChars) problems.push(`${what} name is too long: max ${nameChars}, got ${name.length}.`);
  };
  const checkLines = (items: readonly { id: string; text: string }[], where: string) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) problems.push(`${where} repeats an item id.`);
    for (const item of items) {
      checkId(item.id, where);
      if (!item.text.trim()) problems.push(`${where} has an empty item.`);
      if (item.text.length > textChars) {
        problems.push(`An item in ${where} is too long: max ${textChars}, got ${item.text.length}.`);
      }
    }
  };

  if (new Set(tree.kits.map((kit) => kit.id)).size !== tree.kits.length) problems.push("Two kits share an id.");
  if (new Set(tree.areas.map((area) => area.id)).size !== tree.areas.length) problems.push("Two areas share an id.");
  const kitIds = new Set(tree.kits.map((kit) => kit.id));
  const placedKits = new Set<string>();
  for (const kit of tree.kits) {
    checkId(kit.id, kit.name || "A kit");
    checkName(kit.name, `Kit ${kit.id}`);
    if (kit.id === FINAL_CHECKS_KIT) problems.push(`"${FINAL_CHECKS_KIT}" is reserved for final checks.`);
    checkLines(kit.items, kit.name || "A kit");
  }
  for (const area of tree.areas) {
    checkId(area.id, area.name || "An area");
    checkName(area.name, `Area ${area.id}`);
    checkLines(area.finalChecks, `${area.name} final checks`);
    const here = area.placements.map((placement) => placement.kitId);
    if (new Set(here).size !== here.length) problems.push(`${area.name} uses a kit twice.`);
    for (const placement of area.placements) {
      if (!kitIds.has(placement.kitId)) problems.push(`${area.name} uses a kit that doesn't exist.`);
      placedKits.add(placement.kitId);
      checkLines(placement.extraItems, `${area.name} extra items`);
      const kitItems = tree.kits.find((kit) => kit.id === placement.kitId)?.items ?? [];
      if (placement.extraItems.some((extra) => kitItems.some((item) => item.id === extra.id))) {
        problems.push(`${area.name} extra items repeat an item id from the kit.`);
      }
    }
  }
  for (const kit of tree.kits) {
    if (!placedKits.has(kit.id)) problems.push(`${kit.name} isn't in any area.`);
  }
  const views = flattenChecklist(tree);
  for (const view of views) {
    if (view.total === 0) problems.push(`${view.name} has nothing to check.`);
  }
  const total = views.reduce((sum, view) => sum + view.total, 0);
  if (total > rows) problems.push(`Too many items: max ${rows}, got ${total}.`);
  return problems;
}
