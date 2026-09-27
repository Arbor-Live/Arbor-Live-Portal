import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";
import { formatTime, pacificDayIndexFromAnchor } from "@/lib/format";
import { isSectionBlockType } from "@/lib/schedule-block-types";

/**
 * Run of show: sections (setup, show, strike, custom) carry crew; moments
 * (doors, soundchecks, sets, changeovers) happen inside a section. Everything
 * here works on schedule block drafts, so the editor, warnings, and build share
 * one model.
 */

const MINUTE = 60_000;
/** A changeover sits between two sets; allow small gaps when pairing them. */
const PAIRING_SLACK_MS = 5 * MINUTE;

export type RunOfShowAct = {
  key: string;
  name: string;
  participationId?: string;
  needId?: string;
  /** A lineup position nobody has filled yet ("TBA"). */
  open: boolean;
};

export function actKeyOf(ref: { participationId?: string; needId?: string }) {
  if (ref.participationId) return `p:${ref.participationId}`;
  if (ref.needId) return `n:${ref.needId}`;
  return null;
}

export type TimedBlock = {
  block: TimelineBlockDraft;
  index: number;
  start: number;
  end: number;
};

export type RunOfShowEntry = {
  /** Null for a moment that falls outside every section. */
  section: TimedBlock | null;
  moments: TimedBlock[];
};

export type RunOfShowDay = { dayIndex: number; entries: RunOfShowEntry[] };

function timed(blocks: TimelineBlockDraft[]): TimedBlock[] {
  return blocks.flatMap((block, index) => {
    const start = localDateTimeInputToMs(block.startsAt);
    const end = localDateTimeInputToMs(block.endsAt);
    if (start == null || end == null) return [];
    return [{ block, index, start, end }];
  });
}

/** The section a moment belongs to: the latest-starting section containing its start. */
function sectionFor(moment: TimedBlock, sections: TimedBlock[]) {
  let best: TimedBlock | null = null;
  for (const section of sections) {
    if (moment.start < section.start || moment.start >= section.end) continue;
    if (!best || section.start > best.start) best = section;
  }
  return best;
}

export function nestRunOfShow(blocks: TimelineBlockDraft[]): RunOfShowDay[] {
  const all = timed(blocks);
  const sections = all.filter((row) => isSectionBlockType(row.block.blockType));
  const moments = all.filter((row) => !isSectionBlockType(row.block.blockType));

  const bySection = new Map<number, TimedBlock[]>();
  const orphans: TimedBlock[] = [];
  for (const moment of moments) {
    const section = sectionFor(moment, sections);
    if (!section) {
      orphans.push(moment);
      continue;
    }
    bySection.set(section.index, [...(bySection.get(section.index) ?? []), moment]);
  }

  const entries: Array<RunOfShowEntry & { start: number; dayIndex: number }> = [
    ...sections.map((section) => ({
      section,
      moments: (bySection.get(section.index) ?? []).sort((a, b) => a.start - b.start),
      start: section.start,
      dayIndex: section.block.dayIndex,
    })),
    ...orphans.map((moment) => ({
      section: null,
      moments: [moment],
      start: moment.start,
      dayIndex: moment.block.dayIndex,
    })),
  ].sort((a, b) => a.start - b.start);

  const days = new Map<number, RunOfShowEntry[]>();
  for (const { start: _start, dayIndex, ...entry } of entries) {
    days.set(dayIndex, [...(days.get(dayIndex) ?? []), entry]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, dayEntries]) => ({ dayIndex, entries: dayEntries }));
}

/** The sets on either side of a changeover. */
export function changeoverNeighbors(blocks: TimelineBlockDraft[], changeover: TimelineBlockDraft) {
  const all = timed(blocks);
  const self = all.find((row) => row.block === changeover);
  if (!self) return { before: undefined, after: undefined };
  const sets = all.filter((row) => row.block.blockType === "set");
  const before = sets
    .filter((row) => row.end <= self.start + PAIRING_SLACK_MS && row.end >= self.start - PAIRING_SLACK_MS)
    .sort((a, b) => b.end - a.end)[0];
  const after = sets
    .filter((row) => row.start >= self.end - PAIRING_SLACK_MS && row.start <= self.end + PAIRING_SLACK_MS)
    .sort((a, b) => a.start - b.start)[0];
  return { before: before?.block, after: after?.block };
}

/** Rough time a changeover needs: a base reset plus two minutes per cable swap. */
export function suggestedChangeoverMinutes(swapCount: number) {
  return Math.max(10, 5 + 2 * swapCount);
}

export type ActNameLookup = (block: TimelineBlockDraft) => string | undefined;
export type SwapLookup = (fromAct: string, toAct: string) => string[] | undefined;

export type RunOfShowIssues = {
  /** Keyed by block ref (`clientId ?? id`). */
  byRef: Map<string, string[]>;
  summary: string[];
};

export function runOfShowIssues(
  blocks: TimelineBlockDraft[],
  acts: RunOfShowAct[],
  options: { actName: ActNameLookup; swaps?: SwapLookup },
): RunOfShowIssues {
  const byRef = new Map<string, string[]>();
  const add = (block: TimelineBlockDraft, message: string) => {
    const ref = block.clientId ?? block.id;
    if (!ref) return;
    byRef.set(ref, [...(byRef.get(ref) ?? []), message]);
  };
  const all = timed(blocks);
  const sections = all.filter((row) => isSectionBlockType(row.block.blockType));
  const ofType = (type: TimelineBlockDraft["blockType"]) =>
    all.filter((row) => row.block.blockType === type).sort((a, b) => a.start - b.start);
  const doors = ofType("doors")[0];

  if (doors) {
    for (const soundcheck of ofType("soundcheck")) {
      if (soundcheck.end > doors.start) {
        add(soundcheck.block, `Runs into doors (${formatTime(doors.start)})`);
      }
    }
    for (const set of ofType("set")) {
      if (set.start < doors.start) add(set.block, "Starts before doors");
    }
  }

  for (const type of ["set", "soundcheck"] as const) {
    const rows = ofType(type);
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (current.start < previous.end) {
        const noun = type === "set" ? "set" : "soundcheck";
        add(current.block, `Overlaps ${options.actName(previous.block) ?? "another"} ${noun}`);
        add(previous.block, `Overlaps ${options.actName(current.block) ?? "another"} ${noun}`);
      }
    }
  }

  if (sections.length > 0) {
    for (const moment of all) {
      if (isSectionBlockType(moment.block.blockType)) continue;
      const section = sectionFor(moment, sections);
      if (!section) add(moment.block, "Outside every section");
      else if (moment.end > section.end) {
        add(moment.block, `Runs past the end of ${section.block.label || "its section"}`);
      }
    }
  }

  if (options.swaps) {
    for (const changeover of ofType("changeover")) {
      const { before, after } = changeoverNeighbors(blocks, changeover.block);
      const from = before ? options.actName(before) : undefined;
      const to = after ? options.actName(after) : undefined;
      const lines = from && to ? options.swaps(from, to) : undefined;
      if (!lines) continue;
      const needed = suggestedChangeoverMinutes(lines.length);
      const minutes = Math.round((changeover.end - changeover.start) / MINUTE);
      if (minutes < needed) {
        add(
          changeover.block,
          `Tight for ${lines.length} cable swap${lines.length === 1 ? "" : "s"} (~${needed} min)`,
        );
      }
    }
  }

  const summary: string[] = [];
  const withSet = new Set(
    all
      .filter((row) => row.block.blockType === "set")
      .map((row) => actKeyOf(row.block))
      .filter(Boolean),
  );
  const missing = acts.filter((act) => !act.open && !withSet.has(act.key));
  if (missing.length > 0) {
    summary.push(`No set time yet: ${missing.map((act) => act.name).join(", ")}`);
  }
  const flagged = byRef.size;
  if (flagged > 0) {
    summary.push(flagged === 1 ? "1 item needs a look" : `${flagged} items need a look`);
  }
  return { byRef, summary };
}

export type BuildRunOfShowInput = {
  /** Acts in the order they play, each with its set length. */
  playOrder: Array<{ act: RunOfShowAct; setMinutes: number }>;
  doorsAt: number;
  firstSetAt: number;
  changeoverMinutes: number;
  soundcheckMinutes: number;
  /** Reverse puts the headliner (last to play) first, so openers' gear stays set. */
  soundcheckOrder: "reverse" | "same";
  eventStartAt: number;
};

/**
 * Lay out doors, soundchecks, sets, and changeovers. Replaces existing doors,
 * changeovers, and the included acts' soundcheck/set (keeping their ids);
 * sections and other acts' blocks stay. Adds a Show section when no section
 * holds the sets.
 */
export function buildRunOfShow(
  blocks: TimelineBlockDraft[],
  input: BuildRunOfShowInput,
  makeClientId: () => string,
): TimelineBlockDraft[] {
  const included = new Set(input.playOrder.map(({ act }) => act.key));
  const replaced = (block: TimelineBlockDraft) => {
    if (block.blockType === "doors" || block.blockType === "changeover") return true;
    const key = actKeyOf(block);
    return Boolean(key && included.has(key));
  };
  const kept = blocks.filter((block) => !replaced(block));
  const reusable = new Map(
    blocks
      .filter((block) => actKeyOf(block) && included.has(actKeyOf(block)!))
      .map((block) => [`${actKeyOf(block)}:${block.blockType}`, block]),
  );

  const draft = (
    blockType: TimelineBlockDraft["blockType"],
    label: string,
    start: number,
    end: number,
    act?: RunOfShowAct,
  ): TimelineBlockDraft => {
    const previous = act ? reusable.get(`${act.key}:${blockType}`) : undefined;
    const block: TimelineBlockDraft = {
      ...(previous ? { id: previous.id, clientId: previous.clientId } : { clientId: makeClientId() }),
      blockType,
      label,
      dayIndex: pacificDayIndexFromAnchor(input.eventStartAt, start),
      startsAt: toLocalDateTimeInput(start),
      endsAt: toLocalDateTimeInput(end),
      notes: previous?.notes ?? "",
    };
    if (act) {
      block.actOwned = true;
      if (act.participationId) block.participationId = act.participationId;
      else if (act.needId) block.needId = act.needId;
    }
    return block;
  };

  const built: TimelineBlockDraft[] = [];
  let cursor = input.firstSetAt;
  input.playOrder.forEach(({ act, setMinutes }, index) => {
    const end = cursor + setMinutes * MINUTE;
    built.push(draft("set", `${act.name} set`, cursor, end, act));
    cursor = end;
    const next = input.playOrder[index + 1];
    if (next && input.changeoverMinutes > 0) {
      const changeoverEnd = cursor + input.changeoverMinutes * MINUTE;
      built.push(draft("changeover", `Changeover to ${next.act.name}`, cursor, changeoverEnd));
      cursor = changeoverEnd;
    }
  });
  const lastSetEnd = cursor;

  const doorsEnd = input.firstSetAt > input.doorsAt ? input.firstSetAt : input.doorsAt + 15 * MINUTE;
  built.push(draft("doors", "Doors", input.doorsAt, doorsEnd));

  const checkOrder =
    input.soundcheckOrder === "reverse" ? [...input.playOrder].reverse() : input.playOrder;
  let checkStart = input.doorsAt - checkOrder.length * input.soundcheckMinutes * MINUTE;
  for (const { act } of checkOrder) {
    const end = checkStart + input.soundcheckMinutes * MINUTE;
    built.push(draft("soundcheck", `${act.name} soundcheck`, checkStart, end, act));
    checkStart = end;
  }

  const showStart = Math.min(input.doorsAt, input.firstSetAt);
  const hasShowSection = timed(kept).some(
    (row) =>
      isSectionBlockType(row.block.blockType) &&
      row.start <= input.firstSetAt &&
      row.end > input.firstSetAt,
  );
  if (!hasShowSection && input.playOrder.length > 0) {
    built.push(draft("show", "Show", showStart, Math.max(lastSetEnd, doorsEnd)));
  }

  return [...kept, ...built].sort(
    (a, b) =>
      (localDateTimeInputToMs(a.startsAt) ?? 0) - (localDateTimeInputToMs(b.startsAt) ?? 0),
  );
}
