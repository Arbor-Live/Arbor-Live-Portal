import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { hoursBetweenLocal } from "@/lib/crew-shift-assign";
import {
  localDateTimeInputToMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";
import { pacificDayIndexFromAnchor, pacificScheduleDayCount } from "@/lib/format";
import { sortScheduleBlocksByTime } from "@/lib/event-schedule-blocks";
import { SCHEDULE_BLOCK_TYPES } from "@/lib/schedule-block-types";

export {
  applyScheduleBlockEndChange,
  applyScheduleBlockStartChange,
  createScheduleBlockDraft,
  DEFAULT_SCHEDULE_BLOCK_DURATION_MS,
  sortScheduleBlocksByTime,
} from "@/lib/event-schedule-blocks";

export type EventShiftDraft = {
  id?: Id<"eventCrewShifts">;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
  expenseReportId?: Id<"eventExpenseReports">;
  role: string;
  userId?: string;
  /** Trainee shadowing (no pay, never billed). */
  crewApplicationId?: Id<"crewApplications">;
  personName: string;
  startsAt: string;
  endsAt: string;
  estimatedHourlyRateUsd?: number;
  postedToExpense: boolean;
  notes: string;
  /** When true, shift times stay custom instead of mirroring the linked block. */
  timesOverridden?: boolean;
};

export { toLocalDateTimeInput };

export function getBlockRef(block: TimelineBlockDraft) {
  return block.clientId ?? block.id;
}

export function withStableBlockRefs(
  nextBlocks: TimelineBlockDraft[],
  counterRef: { current: number },
) {
  return nextBlocks.map((block) =>
    block.clientId || block.id
      ? block
      : {
          ...block,
          clientId: `local-block-${(counterRef.current += 1)}`,
        },
  );
}

export function mapPersistedBlockIdByRef(inputBlocks: TimelineBlockDraft[]) {
  const result = new Map<string, Id<"eventScheduleBlocks">>();
  for (const block of inputBlocks) {
    if (!block.id) continue;
    if (block.clientId) {
      result.set(block.clientId, block.id as Id<"eventScheduleBlocks">);
    }
    result.set(block.id, block.id as Id<"eventScheduleBlocks">);
  }
  return result;
}

export function eventDayCount(startAt: string, endAt: string) {
  if (!startAt || !endAt) return 1;
  const startMs = localDateTimeInputToMs(startAt);
  const endMs = localDateTimeInputToMs(endAt);
  if (startMs == null || endMs == null) return 1;
  return pacificScheduleDayCount(startMs, endMs);
}

type EventType = "Crewed Event" | "Rental with Crew" | "Dry Hire" | "Services Only";
type RentalFulfillmentMode = "delivery" | "will_call";

export function eventTypeHasCrewAssignment(eventType: EventType | undefined) {
  return eventType === "Crewed Event" || eventType === "Rental with Crew" || eventType === "Dry Hire";
}

export function buildQuickAddScheduleBlocks(args: {
  eventType: EventType;
  startAt: string;
  endAt: string;
  rentalFulfillmentMode: RentalFulfillmentMode;
  withStableRefs: (blocks: TimelineBlockDraft[]) => TimelineBlockDraft[];
}) {
  const { eventType, startAt, endAt, rentalFulfillmentMode, withStableRefs } = args;
  const showStartMs = localDateTimeInputToMs(startAt);
  const showEndMs = localDateTimeInputToMs(endAt);
  if (showStartMs == null || showEndMs == null) return withStableRefs([]);

  const setupStartMs = showStartMs - 3 * 60 * 60 * 1000;
  const strikeEndMs = showEndMs + 2 * 60 * 60 * 1000;
  const deliveryStartMs = showStartMs - 2 * 60 * 60 * 1000;
  const returnEndMs = showEndMs + 2 * 60 * 60 * 1000;
  const setupDayIndex = pacificDayIndexFromAnchor(showStartMs, setupStartMs);
  const showDayIndex = 0;
  const strikeDayIndex = pacificDayIndexFromAnchor(showStartMs, showEndMs);
  const deliveryDayIndex = pacificDayIndexFromAnchor(showStartMs, deliveryStartMs);
  const returnDayIndex = pacificDayIndexFromAnchor(showStartMs, showEndMs);

  if (eventType === "Dry Hire") {
    const outboundLabel = rentalFulfillmentMode === "will_call" ? "Check-out Window" : "Drop-off Window";
    const returnLabel = rentalFulfillmentMode === "will_call" ? "Return Window" : "Pickup Window";
    return withStableRefs(sortScheduleBlocksByTime([
      {
        blockType: "setup",
        label: outboundLabel,
        dayIndex: deliveryDayIndex,
        startsAt: toLocalDateTimeInput(deliveryStartMs),
        endsAt: toLocalDateTimeInput(showStartMs),
        notes: "",
      },
      {
        blockType: "strike",
        label: returnLabel,
        dayIndex: returnDayIndex,
        startsAt: toLocalDateTimeInput(showEndMs),
        endsAt: toLocalDateTimeInput(returnEndMs),
        notes: "",
      },
    ]));
  }

  const baseBlocks: TimelineBlockDraft[] = [
    {
      blockType: "setup",
      label: "Setup",
      dayIndex: setupDayIndex,
      startsAt: toLocalDateTimeInput(setupStartMs),
      endsAt: toLocalDateTimeInput(showStartMs),
      notes: "",
    },
    {
      blockType: "strike",
      label: "Strike",
      dayIndex: strikeDayIndex,
      startsAt: toLocalDateTimeInput(showEndMs),
      endsAt: toLocalDateTimeInput(strikeEndMs),
      notes: "",
    },
  ];

  if (eventType === "Crewed Event") {
    baseBlocks.splice(1, 0, {
      blockType: "show",
      label: "Show",
      dayIndex: showDayIndex,
      startsAt: toLocalDateTimeInput(showStartMs),
      endsAt: toLocalDateTimeInput(showEndMs),
      notes: "",
    });
  }

  return withStableRefs(sortScheduleBlocksByTime(baseBlocks));
}

export function shiftHours(shift: Pick<EventShiftDraft, "startsAt" | "endsAt">) {
  return hoursBetweenLocal(shift.startsAt, shift.endsAt);
}

type ShiftBlockLink = {
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
};

export function shiftBelongsToBlock(shift: ShiftBlockLink, block: TimelineBlockDraft) {
  const blockRef = getBlockRef(block);
  if (blockRef && shift.scheduleBlockRef === blockRef) return true;
  if (block.id && shift.scheduleBlockId === block.id) return true;
  if (block.id && shift.scheduleBlockRef === block.id) return true;
  return false;
}

export function shiftTimesMatchBlock(
  shift: { startsAt: string; endsAt: string },
  block: { startsAt: string; endsAt: string },
) {
  return shift.startsAt === block.startsAt && shift.endsAt === block.endsAt;
}

export function shiftRowKey(
  shift: { id?: string },
  blockRef: string | undefined,
  rowIndex: number,
) {
  return shift.id ?? `${blockRef ?? "orphan"}-shift-${rowIndex}`;
}

/** Mark shifts whose stored times differ from their block (loaded overrides). */
export function applyShiftTimesOverrideFlags<T extends ShiftBlockLink & EventShiftDraft>(
  shifts: T[],
  blocks: TimelineBlockDraft[],
): T[] {
  return shifts.map((shift) => {
    const block = blocks.find((candidate) => shiftBelongsToBlock(shift, candidate));
    if (!block || shift.timesOverridden) return shift;
    if (shiftTimesMatchBlock(shift, block)) return shift;
    return { ...shift, timesOverridden: true };
  });
}

/**
 * Crew shift times mirror their schedule block's window unless overridden.
 * Call whenever draft block times change so non-overridden shifts stay aligned.
 */
export function syncShiftsToBlockTimes<T extends ShiftBlockLink & EventShiftDraft>(
  shifts: T[],
  blocks: TimelineBlockDraft[],
): T[] {
  let changed = false;
  const next = shifts.map((shift) => {
    if (shift.timesOverridden) return shift;
    const block = blocks.find((candidate) => shiftBelongsToBlock(shift, candidate));
    if (!block) return shift;
    if (shiftTimesMatchBlock(shift, block)) return shift;
    changed = true;
    return { ...shift, startsAt: block.startsAt, endsAt: block.endsAt };
  });
  // Same array when nothing moved, so a keystroke in the run of show doesn't
  // invalidate everything memoized on `shifts` (the whole crew board).
  return changed ? next : shifts;
}

/**
 * When schedule blocks are wholesale-replaced (e.g. Quick Add), relink crew shifts
 * from retired blocks to the new ones by block type and sync non-overridden times.
 */
export function reconcileShiftsForReplacedBlocks<T extends ShiftBlockLink & EventShiftDraft>(
  previousBlocks: TimelineBlockDraft[],
  nextBlocks: TimelineBlockDraft[],
  shifts: T[],
): T[] {
  const blockReplaceMap = new Map<string, TimelineBlockDraft>();
  // Blocks that survive the replacement (an act's soundcheck/set) keep their crew.
  const nextRefs = new Set(nextBlocks.map(getBlockRef).filter(Boolean));
  const kept = previousBlocks.filter((block) => nextRefs.has(getBlockRef(block)));
  for (const block of kept) {
    const ref = getBlockRef(block);
    const next = nextBlocks.find((candidate) => getBlockRef(candidate) === ref);
    if (ref && next) blockReplaceMap.set(ref, next);
    if (block.id && next) blockReplaceMap.set(block.id, next);
  }
  const replacedPrevious = previousBlocks.filter((block) => !kept.includes(block));
  const replacementNext = nextBlocks.filter(
    (block) => !kept.some((keptBlock) => getBlockRef(keptBlock) === getBlockRef(block)),
  );

  for (const blockType of SCHEDULE_BLOCK_TYPES) {
    const previousOfType = replacedPrevious.filter((block) => block.blockType === blockType);
    const nextOfType = replacementNext.filter((block) => block.blockType === blockType);
    const pairCount = Math.min(previousOfType.length, nextOfType.length);
    for (let index = 0; index < pairCount; index += 1) {
      const previousBlock = previousOfType[index];
      const nextBlock = nextOfType[index];
      const previousRef = getBlockRef(previousBlock);
      if (previousRef) blockReplaceMap.set(previousRef, nextBlock);
      if (previousBlock.id) blockReplaceMap.set(previousBlock.id, nextBlock);
    }
  }

  const relinked = shifts.map((shift) => {
    const previousBlock = previousBlocks.find((block) => shiftBelongsToBlock(shift, block));
    if (!previousBlock) return shift;

    const previousRef = getBlockRef(previousBlock);
    const nextBlock =
      (previousRef ? blockReplaceMap.get(previousRef) : undefined) ??
      (previousBlock.id ? blockReplaceMap.get(previousBlock.id) : undefined);
    if (!nextBlock) {
      return {
        ...shift,
        scheduleBlockId: undefined,
        scheduleBlockRef: undefined,
      };
    }

    const nextRef = getBlockRef(nextBlock);
    return {
      ...shift,
      scheduleBlockId: nextBlock.id,
      scheduleBlockRef: nextRef,
    };
  });

  return syncShiftsToBlockTimes(relinked, nextBlocks);
}

export function timelineBlocksFromSaved(
  savedBlocks: Array<{
    id: string;
    clientId?: string;
    blockType: TimelineBlockDraft["blockType"];
    label: string;
    dayIndex: number;
    startsAt: number;
    endsAt: number;
    notes?: string;
    participationId?: string;
    needId?: string;
  }>,
): TimelineBlockDraft[] {
  return sortScheduleBlocksByTime(
    savedBlocks.map((row) =>
      blockDraftFromRow({ ...row, _id: row.id }, row.clientId ?? row.id),
    ),
  );
}

export type PersistedBlockRow = {
  _id: string;
  blockType: TimelineBlockDraft["blockType"];
  label: string;
  dayIndex: number;
  startsAt: number;
  endsAt: number;
  notes?: string;
  participationId?: string;
  needId?: string;
};

/** One draft shape for loaded and saved blocks, so baseline comparisons line up. */
export function blockDraftFromRow(row: PersistedBlockRow, clientId = row._id): TimelineBlockDraft {
  const draft: TimelineBlockDraft = {
    id: row._id,
    clientId,
    blockType: row.blockType,
    label: row.label,
    dayIndex: row.dayIndex,
    startsAt: toLocalDateTimeInput(row.startsAt),
    endsAt: toLocalDateTimeInput(row.endsAt),
    notes: row.notes ?? "",
  };
  if (row.participationId) {
    draft.actOwned = true;
    draft.participationId = row.participationId;
  } else if (row.needId) {
    draft.actOwned = true;
    draft.needId = row.needId;
  }
  return draft;
}

/** Quick Add rebuilds staff blocks; an act's soundcheck/set blocks stay put. */
export function keepActBlocks(
  previous: TimelineBlockDraft[],
  next: TimelineBlockDraft[],
): TimelineBlockDraft[] {
  return sortScheduleBlocksByTime([...next, ...previous.filter((block) => block.actOwned)]);
}

function actBlockKey(block: TimelineBlockDraft) {
  return [block.id, block.blockType, block.label, block.startsAt, block.endsAt, block.notes].join("|");
}

type ScheduleState<T> = { blocks: TimelineBlockDraft[]; shifts: T[] };

/**
 * Three-way merge of act soundcheck/set blocks for an editor that can edit them
 * (the Run of Show). Server changes land in the baseline; they reach the draft
 * only where the user has not edited or removed that block locally, so local
 * edits stay unsaved and win on save. Returns null when nothing changed.
 */
export function mergeServerActBlocks<T extends ShiftBlockLink & EventShiftDraft>(
  state: ScheduleState<T>,
  baseline: ScheduleState<T>,
  serverActBlocks: TimelineBlockDraft[],
): { state: ScheduleState<T>; baseline: ScheduleState<T> } | null {
  const byId = (blocks: TimelineBlockDraft[]) =>
    new Map(blocks.filter((block) => block.actOwned && block.id).map((block) => [block.id!, block]));
  const server = byId(serverActBlocks);
  const base = byId(baseline.blocks);
  const local = byId(state.blocks);

  let nextState = state.blocks;
  let nextBase = baseline.blocks;
  const removed = new Set<string>();
  const replace = (blocks: TimelineBlockDraft[], id: string, next: TimelineBlockDraft | null) => {
    const kept = blocks.filter((block) => block.id !== id);
    return next ? [...kept, next] : kept;
  };

  for (const id of new Set([...server.keys(), ...base.keys()])) {
    const s = server.get(id);
    const b = base.get(id);
    const l = local.get(id);
    if (s && !b) {
      nextBase = replace(nextBase, id, s);
      if (!l) nextState = replace(nextState, id, s);
    } else if (!s && b) {
      removed.add(id);
      nextBase = replace(nextBase, id, null);
      nextState = replace(nextState, id, null);
    } else if (s && b && actBlockKey(s) !== actBlockKey(b)) {
      nextBase = replace(nextBase, id, s);
      if (l && actBlockKey(l) === actBlockKey(b)) nextState = replace(nextState, id, s);
    }
  }
  if (nextState === state.blocks && nextBase === baseline.blocks) return null;

  const unlink = (shifts: T[]) =>
    shifts.map((shift) =>
      (shift.scheduleBlockId && removed.has(shift.scheduleBlockId)) ||
      (shift.scheduleBlockRef && removed.has(shift.scheduleBlockRef))
        ? { ...shift, scheduleBlockId: undefined, scheduleBlockRef: undefined }
        : shift,
    );
  return {
    state: { blocks: sortScheduleBlocksByTime(nextState), shifts: unlink(state.shifts) },
    baseline: { blocks: sortScheduleBlocksByTime(nextBase), shifts: unlink(baseline.shifts) },
  };
}

/**
 * Act soundcheck/set blocks are written by the lineup, not this editor. Pull the
 * server's current set into a schedule draft without touching staff edits: add,
 * move, and drop act blocks; crew on a moved block follow it unless their times
 * are custom; crew on a dropped block become unlinked (the server did the same).
 * Returns null when the draft already matches.
 */
export function rebaseActBlocks<T extends ShiftBlockLink & EventShiftDraft>(
  state: { blocks: TimelineBlockDraft[]; shifts: T[] },
  serverActBlocks: TimelineBlockDraft[],
): { blocks: TimelineBlockDraft[]; shifts: T[] } | null {
  const localAct = state.blocks.filter((block) => block.actOwned);
  const same =
    localAct.map(actBlockKey).sort().join("\n") ===
    serverActBlocks.map(actBlockKey).sort().join("\n");
  if (same) return null;

  const serverById = new Map(serverActBlocks.map((block) => [block.id, block]));
  const shifts = state.shifts.map((shift) => {
    const local = localAct.find((block) => shiftBelongsToBlock(shift, block));
    if (!local) return shift;
    const server = local.id ? serverById.get(local.id) : undefined;
    if (!server) return { ...shift, scheduleBlockId: undefined, scheduleBlockRef: undefined };
    if (shift.timesOverridden || shiftTimesMatchBlock(shift, server)) return shift;
    return { ...shift, startsAt: server.startsAt, endsAt: server.endsAt };
  });
  return {
    blocks: sortScheduleBlocksByTime([
      ...state.blocks.filter((block) => !block.actOwned),
      ...serverActBlocks,
    ]),
    shifts,
  };
}

export function attachShiftsToPersistedBlocks<T extends EventShiftDraft>(
  shifts: T[],
  blocks: TimelineBlockDraft[],
): T[] {
  const persistedBlockIdByRef = mapPersistedBlockIdByRef(blocks);
  return shifts.map((shift) => {
    const persistedId =
      (shift.scheduleBlockId && blocks.some((block) => block.id === shift.scheduleBlockId)
        ? shift.scheduleBlockId
        : undefined) ??
      (shift.scheduleBlockRef ? persistedBlockIdByRef.get(shift.scheduleBlockRef) : undefined);
    return {
      ...shift,
      scheduleBlockId: persistedId,
      scheduleBlockRef: persistedId ?? shift.scheduleBlockRef,
    };
  });
}

export function resolveShiftScheduleBlockId(
  shift: EventShiftDraft,
  blocks: TimelineBlockDraft[],
) {
  const persistedBlockIdByRef = mapPersistedBlockIdByRef(blocks);
  const validBlockIds = new Set(blocks.map((block) => block.id).filter(Boolean));
  return (
    (shift.scheduleBlockId && validBlockIds.has(shift.scheduleBlockId)
      ? shift.scheduleBlockId
      : shift.scheduleBlockRef
        ? persistedBlockIdByRef.get(shift.scheduleBlockRef)
        : undefined) ?? undefined
  );
}
