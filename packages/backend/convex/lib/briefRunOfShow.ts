import type {
  EventBriefAct,
  EventBriefMoment,
  EventBriefRunOfShowDay,
  EventBriefRunOfShowEntry,
  EventBriefShift,
} from "@arbor/rider-document";
import { isSectionBlockType, type ScheduleBlockType } from "./scheduleBlockTypes";

/**
 * The printed brief's run of show: sections with the moments inside them and
 * the crew who work each section, like the Run of Show tab. Pure, so the
 * nesting is testable without a database.
 */

const TYPE_LABELS: Record<ScheduleBlockType, string> = {
  setup: "Setup",
  show: "Show",
  strike: "Strike",
  custom: "Custom",
  doors: "Doors",
  soundcheck: "Soundcheck",
  set: "Set",
  changeover: "Changeover",
};

const ACT_SUFFIX = / (soundcheck|set)$/;
const MINUTE = 60_000;

export type BriefBlockRow = {
  _id: string;
  blockType: ScheduleBlockType;
  label: string;
  dayIndex: number;
  startsAt: number;
  endsAt: number;
  notes?: string;
  participationId?: string;
  needId?: string;
};

export type BriefShiftRow = {
  scheduleBlockId?: string;
  role: string;
  personName?: string;
  userId?: string;
  crewApplicationId?: string;
  callTime?: number;
  startsAt: number;
  endsAt: number;
  notes?: string;
};

export type BriefRunOfShowOptions = {
  formatTime: (ms: number) => string;
  formatDate: (ms: number) => string;
  /** Cable swaps going from one act to the next, keyed by act name. */
  swaps: (fromAct: string, toAct: string) => string[] | undefined;
};

function actKeyOf(block: BriefBlockRow) {
  if (block.participationId) return `p:${block.participationId}`;
  if (block.needId) return `n:${block.needId}`;
  return null;
}

/** Act blocks are labelled "<act> soundcheck" / "<act> set" (see `actBlockLabel`). */
function actNameOf(block: BriefBlockRow) {
  return actKeyOf(block) ? block.label.replace(ACT_SUFFIX, "") : undefined;
}

function durationLabel(start: number, end: number) {
  const minutes = Math.round((end - start) / MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The section a moment belongs to: the latest-starting one containing its start. */
function sectionFor(moment: BriefBlockRow, sections: BriefBlockRow[]) {
  let best: BriefBlockRow | null = null;
  for (const section of sections) {
    if (moment.startsAt < section.startsAt || moment.startsAt >= section.endsAt) continue;
    if (!best || section.startsAt > best.startsAt) best = section;
  }
  return best;
}

/** The sets either side of a changeover, allowing small gaps. */
function changeoverActs(changeover: BriefBlockRow, sets: BriefBlockRow[]) {
  const slack = 5 * MINUTE;
  const before = sets
    .filter((set) => set.endsAt <= changeover.startsAt + slack)
    .sort((a, b) => b.endsAt - a.endsAt)[0];
  const after = sets
    .filter((set) => set.startsAt >= changeover.endsAt - slack)
    .sort((a, b) => a.startsAt - b.startsAt)[0];
  return { from: before && actNameOf(before), to: after && actNameOf(after) };
}

export function buildBriefRunOfShow(
  blocks: BriefBlockRow[],
  shifts: BriefShiftRow[],
  options: BriefRunOfShowOptions,
): { runOfShow: EventBriefRunOfShowDay[]; acts: EventBriefAct[]; otherShifts: EventBriefShift[] } {
  const { formatTime, formatDate, swaps } = options;
  const sorted = [...blocks].sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt);
  const sections = sorted.filter((block) => isSectionBlockType(block.blockType));
  const moments = sorted.filter((block) => !isSectionBlockType(block.blockType));
  const sets = moments.filter((block) => block.blockType === "set");
  const sectionIds = new Set(sections.map((section) => section._id));

  function shiftRow(shift: BriefShiftRow): EventBriefShift {
    const person = shift.personName?.trim();
    const hours = `${formatTime(shift.startsAt)} – ${formatTime(shift.endsAt)}`;
    return {
      role: shift.role,
      person: person || "Open",
      timeLabel:
        shift.callTime != null && shift.callTime !== shift.startsAt
          ? `Call ${formatTime(shift.callTime)} · ${hours}`
          : hours,
      notes: shift.notes?.trim() || undefined,
      open: !person && !shift.userId && !shift.crewApplicationId,
    };
  }

  function momentRow(block: BriefBlockRow): EventBriefMoment {
    let momentSwaps: string[] | undefined;
    if (block.blockType === "changeover") {
      const { from, to } = changeoverActs(block, sets);
      momentSwaps = from && to ? swaps(from, to) : undefined;
    }
    return {
      typeLabel: TYPE_LABELS[block.blockType],
      label: actNameOf(block) ?? block.label,
      startLabel: formatTime(block.startsAt),
      durationLabel: durationLabel(block.startsAt, block.endsAt),
      notes: block.notes?.trim() || undefined,
      swaps: momentSwaps?.length ? momentSwaps : undefined,
    };
  }

  const bySection = new Map<string, BriefBlockRow[]>();
  const orphans: BriefBlockRow[] = [];
  for (const moment of moments) {
    const section = sectionFor(moment, sections);
    if (section) bySection.set(section._id, [...(bySection.get(section._id) ?? []), moment]);
    else orphans.push(moment);
  }

  const entries: Array<{ start: number; dayIndex: number; entry: EventBriefRunOfShowEntry }> = [
    ...sections.map((section) => ({
      start: section.startsAt,
      dayIndex: section.dayIndex,
      entry: {
        section: {
          typeLabel: TYPE_LABELS[section.blockType],
          label: section.label,
          timeLabel: `${formatTime(section.startsAt)} – ${formatTime(section.endsAt)}`,
          notes: section.notes?.trim() || undefined,
          crew: shifts
            .filter((shift) => shift.scheduleBlockId === section._id)
            .sort((a, b) => a.startsAt - b.startsAt || a.role.localeCompare(b.role))
            .map(shiftRow),
        },
        moments: (bySection.get(section._id) ?? []).map(momentRow),
      },
    })),
    ...orphans.map((moment) => ({
      start: moment.startsAt,
      dayIndex: moment.dayIndex,
      entry: { moments: [momentRow(moment)] },
    })),
  ].sort((a, b) => a.start - b.start);

  const days = new Map<number, { start: number; entries: EventBriefRunOfShowEntry[] }>();
  for (const { start, dayIndex, entry } of entries) {
    const day = days.get(dayIndex) ?? { start, entries: [] };
    day.entries.push(entry);
    days.set(dayIndex, day);
  }
  const multiDay = days.size > 1;
  const runOfShow = [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, day]) => ({
      dayLabel: multiDay ? `Day ${dayIndex + 1} · ${formatDate(day.start)}` : undefined,
      entries: day.entries,
    }));

  // Acts in show order: by set time, then acts with only a soundcheck.
  const actRows = new Map<string, { name: string; soundcheck?: BriefBlockRow; set?: BriefBlockRow }>();
  for (const block of moments) {
    const key = actKeyOf(block);
    const name = actNameOf(block);
    if (!key || !name) continue;
    const row = actRows.get(key) ?? { name };
    if (block.blockType === "soundcheck") row.soundcheck ??= block;
    if (block.blockType === "set") row.set ??= block;
    actRows.set(key, row);
  }
  const acts = [...actRows.values()]
    .sort(
      (a, b) =>
        (a.set?.startsAt ?? Number.POSITIVE_INFINITY) - (b.set?.startsAt ?? Number.POSITIVE_INFINITY) ||
        (a.soundcheck?.startsAt ?? 0) - (b.soundcheck?.startsAt ?? 0),
    )
    .map(({ name, soundcheck, set }) => ({
      name,
      soundcheckLabel: soundcheck
        ? `${formatTime(soundcheck.startsAt)} – ${formatTime(soundcheck.endsAt)}`
        : undefined,
      setLabel: set ? `${formatTime(set.startsAt)} – ${formatTime(set.endsAt)}` : undefined,
    }));

  const otherShifts = shifts
    .filter((shift) => !shift.scheduleBlockId || !sectionIds.has(shift.scheduleBlockId))
    .sort((a, b) => a.startsAt - b.startsAt)
    .map(shiftRow);

  return { runOfShow, acts, otherShifts };
}
