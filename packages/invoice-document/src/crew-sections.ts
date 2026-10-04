/**
 * Client-facing presentation of a quote's crew lines, shared by the client
 * portal and the PDF quote.
 *
 * The invoice editor saves one crew line per shift, labeled
 * `[Day N — ][Section — ]Role (Person[ (Lead)])` (see
 * `invoice-crew-from-event.ts`), plus hand-entered `people × hours` rows. Read
 * as a flat list that's dense; this module regroups the same lines so a client
 * can see who works when. It never changes what is billed: every group total
 * is the exact sum of its lines' `amountUsd` (summed in cents).
 */

import { formatUsd } from "@arbor/format";

export type CrewLineInput = {
  id: string;
  label: string;
  /** Billed person-hours. */
  quantity: number;
  rateUsd: number;
  amountUsd: number;
  memberCount?: number;
  performanceHours?: number;
  crewSource?: "manual";
  notes?: string;
};

export type CrewLine = {
  id: string;
  /** `Day 2` on multi-day bookings, from the label prefix. */
  day?: string;
  /** Run of Show section (Load-in, Show, Strike…). */
  section?: string;
  role?: string;
  /** Assigned person. Absent for open slots and hand-entered rows. */
  person?: string;
  lead: boolean;
  /** No one assigned yet. */
  openSlot: boolean;
  /** Hand-entered row: its label is the whole description. */
  manualLabel?: string;
  people: number;
  /** Hours each person works on this line. */
  hoursEach: number;
  rateUsd: number;
  amountUsd: number;
  notes?: string;
};

const SEPARATOR = " — ";
const OPEN_SLOT = "Open slot";
const UNNAMED_ASSIGNEE = "Assigned crew";
const DAY_PREFIX = /^Day \d+$/;

/** Splits `Role (Inner (Lead))` into `Role` and `Inner (Lead)` (balanced parens). */
function splitTrailingParens(text: string): { head: string; inner?: string } {
  const trimmed = text.trim();
  if (!trimmed.endsWith(")")) return { head: trimmed };
  let depth = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const char = trimmed[index];
    if (char === ")") depth += 1;
    else if (char === "(") {
      depth -= 1;
      if (depth === 0) {
        const head = trimmed.slice(0, index).trim();
        const inner = trimmed.slice(index + 1, -1).trim();
        return head ? { head, inner } : { head: trimmed };
      }
    }
  }
  return { head: trimmed };
}

function parseAssignee(text: string): Pick<CrewLine, "person" | "lead" | "openSlot"> {
  const { head, inner } = splitTrailingParens(text);
  const lead = inner === "Lead";
  const name = lead ? head : text.trim();
  if (name === OPEN_SLOT) return { lead, openSlot: true };
  if (name === UNNAMED_ASSIGNEE) return { lead, openSlot: false };
  return { person: name, lead, openSlot: false };
}

function positive(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseCrewLine(line: CrewLineInput): CrewLine {
  const people = positive(line.memberCount);
  const hoursEach = positive(line.performanceHours);
  const base = {
    id: line.id,
    rateUsd: line.rateUsd,
    amountUsd: line.amountUsd,
    notes: line.notes?.trim() || undefined,
  };
  const segments = line.label.split(SEPARATOR).map((segment) => segment.trim());
  const day = segments.length > 1 && DAY_PREFIX.test(segments[0]!) ? segments.shift() : undefined;
  if (line.crewSource === "manual" || (people && people > 1)) {
    return {
      ...base,
      day,
      manualLabel: segments.join(SEPARATOR),
      lead: false,
      openSlot: false,
      people: people ?? 1,
      hoursEach: hoursEach ?? (people ? line.quantity / people : line.quantity),
    };
  }

  const tail = segments.pop() ?? "";
  const section = segments.length ? segments.join(SEPARATOR) : undefined;
  const { head, inner } = splitTrailingParens(tail);

  let parsed: Pick<CrewLine, "role" | "person" | "lead" | "openSlot">;
  if (inner !== undefined && inner !== "Lead") {
    // `Role (Person)` / `Role (Person (Lead))` / `Role (Open slot)`
    parsed = { role: head, ...parseAssignee(inner) };
  } else if (section || tail === OPEN_SLOT || inner === "Lead") {
    // `Section — Person` when the shift had no role (or the role was the name).
    parsed = parseAssignee(tail);
  } else {
    // A free-text label we can't take apart: show it as the role.
    parsed = { role: tail, lead: false, openSlot: false };
  }
  return {
    ...base,
    ...parsed,
    day,
    section,
    people: 1,
    hoursEach: hoursEach ?? line.quantity,
  };
}

export function toCents(usd: number) {
  return Math.round(usd * 100);
}

/** Sum of line amounts, added in cents so group totals add up to the bill exactly. */
export function sumCrewAmountUsd(lines: Array<Pick<CrewLine, "amountUsd">>) {
  return lines.reduce((sum, line) => sum + toCents(line.amountUsd), 0) / 100;
}

/** `4 people × 3 hrs`, or `2 people × 3 hrs + 1 person × 4.5 hrs` when hours differ. */
export function describeHeadcount(lines: Array<Pick<CrewLine, "people" | "hoursEach">>) {
  const peopleByHours = new Map<number, number>();
  for (const line of lines) {
    peopleByHours.set(line.hoursEach, (peopleByHours.get(line.hoursEach) ?? 0) + line.people);
  }
  return [...peopleByHours.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([hours, people]) => `${formatPeople(people)} × ${formatHours(hours)}`)
    .join(" + ");
}

export function headcount(lines: Array<Pick<CrewLine, "people">>) {
  return lines.reduce((sum, line) => sum + line.people, 0);
}

export function formatPeople(count: number) {
  return count === 1 ? "1 person" : `${count} people`;
}

export function formatHours(hours: number) {
  const rounded = Number(hours.toFixed(2));
  return rounded === 1 ? "1 hr" : `${rounded} hrs`;
}

/** `$35/hr`, keeping cents only when the rate has them. */
export function formatCrewRate(rateUsd: number) {
  const usd = formatUsd(rateUsd);
  return `${Number.isInteger(rateUsd) ? usd.replace(/\.00$/, "") : usd}/hr`;
}

/** `3 hrs × $35/hr`, or `2 × 1.5 hrs × $22/hr` on a people × hours row. */
export function describeHoursTimesRate(line: Pick<CrewLine, "people" | "hoursEach" | "rateUsd">) {
  const people = line.people > 1 ? `${line.people} × ` : "";
  return `${people}${formatHours(line.hoursEach)} × ${formatCrewRate(line.rateUsd)}`;
}

export function crewLinePerson(line: CrewLine) {
  if (line.person) return line.person;
  if (line.openSlot) return "To be assigned";
  return undefined;
}

export type CrewGroup = {
  key: string;
  title: string;
  lines: CrewLine[];
  amountUsd: number;
};

function groupBy(lines: CrewLine[], keyOf: (line: CrewLine) => string): CrewGroup[] {
  const groups = new Map<string, CrewLine[]>();
  for (const line of lines) {
    const key = keyOf(line);
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }
  return [...groups.entries()].map(([key, bucket]) => ({
    key,
    title: key,
    lines: bucket,
    amountUsd: sumCrewAmountUsd(bucket),
  }));
}

export type CrewDay = { key: string; title?: string; groups: CrewGroup[]; amountUsd: number };

/**
 * Days (multi-day bookings) → sections in quote order. Hand-entered rows sit in
 * their own group, titled by their label, after the scheduled sections.
 */
export function groupCrewBySection(lines: CrewLine[]): CrewDay[] {
  const dayKeys = [...new Set(lines.filter((line) => line.day).map((line) => line.day!))];
  const days: CrewDay[] = [];
  const build = (key: string, title: string | undefined, dayLines: CrewLine[]) => {
    if (!dayLines.length) return;
    const scheduled = dayLines.filter((line) => !line.manualLabel);
    const manual = dayLines.filter((line) => line.manualLabel);
    const groups = [
      ...groupBy(scheduled, (line) => line.section ?? "Crew"),
      ...manual.map((line) => ({
        key: `manual:${line.id}`,
        title: line.manualLabel!,
        lines: [line],
        amountUsd: sumCrewAmountUsd([line]),
      })),
    ];
    days.push({ key, title, groups, amountUsd: sumCrewAmountUsd(dayLines) });
  };
  for (const day of dayKeys) {
    build(day, day, lines.filter((line) => line.day === day));
  }
  build("other", dayKeys.length ? "Other crew" : undefined, lines.filter((line) => !line.day));
  return days;
}
