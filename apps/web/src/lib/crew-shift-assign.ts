import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import type { CrewAvailabilityResponseStatus } from "@/lib/crew-availability";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";

export const MAX_AUTO_ASSIGN_HOURS = 8;

export type ShiftDraftForAssign = {
  id?: Id<"eventCrewShifts">;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
  role: string;
  userId?: string;
  personName: string;
  startsAt: string;
  endsAt: string;
  postedToExpense: boolean;
  notes: string;
};

export type AssignableResponder = {
  userId: string;
  name: string;
  image?: string;
  isAssigned?: boolean;
  responseStatus: CrewAvailabilityResponseStatus;
  notes?: string;
  partialWindows?: Array<{
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>;
};

type TimeRange = {
  startsAt: string;
  endsAt: string;
};

type BlockIdentity = {
  blockRef?: string;
  blockId?: Id<"eventScheduleBlocks">;
};

function responsePriority(status: CrewAvailabilityResponseStatus) {
  if (status === "yes") return 0;
  if (status === "partial") return 1;
  if (status === "only_if_necessary") return 2;
  return 99;
}

function sortRespondersForAssignment(responders: AssignableResponder[]) {
  return [...responders].sort(
    (a, b) => responsePriority(a.responseStatus) - responsePriority(b.responseStatus),
  );
}

function parseLocalMs(value: string) {
  return localDateTimeInputToMs(value);
}

export function hoursBetweenLocal(startsAt: string, endsAt: string) {
  const start = parseLocalMs(startsAt);
  const end = parseLocalMs(endsAt);
  if (start === null || end === null || end <= start) return 0;
  return Number(((end - start) / 3_600_000).toFixed(2));
}

export function userAssignedHours(shifts: ShiftDraftForAssign[], userId: string) {
  return shifts
    .filter((shift) => shift.userId?.trim() === userId)
    .reduce((total, shift) => total + hoursBetweenLocal(shift.startsAt, shift.endsAt), 0);
}

function remainingHourBudget(
  shifts: ShiftDraftForAssign[],
  userId: string,
  maxHours = MAX_AUTO_ASSIGN_HOURS,
) {
  return Math.max(0, maxHours - userAssignedHours(shifts, userId));
}

function clipRangeToMaxHours(range: TimeRange, maxHours: number): TimeRange | null {
  if (maxHours <= 0) return null;
  const startMs = parseLocalMs(range.startsAt);
  const endMs = parseLocalMs(range.endsAt);
  if (startMs === null || endMs === null || endMs <= startMs) return null;

  const durationHours = (endMs - startMs) / 3_600_000;
  if (durationHours <= maxHours) return range;

  return {
    startsAt: range.startsAt,
    endsAt: toLocalDateTimeInput(startMs + maxHours * 3_600_000),
  };
}

function sortBlocksChronologically(blocks: TimelineBlockDraft[]) {
  return [...blocks].sort(
    (a, b) => (parseLocalMs(a.startsAt) ?? 0) - (parseLocalMs(b.startsAt) ?? 0),
  );
}

function blockIdentityFromShift(shift: ShiftDraftForAssign): BlockIdentity {
  return {
    blockRef: shift.scheduleBlockRef ?? shift.scheduleBlockId,
    blockId: shift.scheduleBlockId,
  };
}

function blockIdentityFromBlock(
  block: TimelineBlockDraft,
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
): BlockIdentity {
  return {
    blockRef: getBlockRef(block),
    blockId: block.id as Id<"eventScheduleBlocks"> | undefined,
  };
}

function blockIdentityKey(identity: BlockIdentity) {
  return identity.blockId ?? identity.blockRef ?? "";
}

function blocksMatch(a: BlockIdentity, b: BlockIdentity) {
  if (a.blockId && b.blockId && a.blockId === b.blockId) return true;
  if (a.blockRef && b.blockRef && a.blockRef === b.blockRef) return true;
  if (a.blockId && b.blockRef && a.blockId === b.blockRef) return true;
  if (a.blockRef && b.blockId && a.blockRef === b.blockId) return true;
  return false;
}

/** At most one assigned shift per user per schedule block. */
export function userHasShiftOnBlock(
  shifts: ShiftDraftForAssign[],
  userId: string,
  block: BlockIdentity,
) {
  return shifts.some(
    (shift) =>
      shift.userId?.trim() === userId &&
      blocksMatch(blockIdentityFromShift(shift), block),
  );
}

function patchShiftWithUser(
  shift: ShiftDraftForAssign,
  userId: string,
  personName: string,
  range?: TimeRange,
): ShiftDraftForAssign {
  return {
    ...shift,
    userId,
    personName,
    startsAt: range?.startsAt ?? shift.startsAt,
    endsAt: range?.endsAt ?? shift.endsAt,
  };
}

function makeShiftForBlock(
  block: TimelineBlockDraft,
  blockRef: string,
  userId: string,
  personName: string,
  range: TimeRange,
  notes = "",
): ShiftDraftForAssign {
  return {
    scheduleBlockId: block.id as Id<"eventScheduleBlocks"> | undefined,
    scheduleBlockRef: blockRef,
    role: "",
    userId,
    personName,
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    postedToExpense: false,
    notes,
  };
}

function findBlockForPartialWindow(
  blocks: TimelineBlockDraft[],
  window: NonNullable<AssignableResponder["partialWindows"]>[number],
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
) {
  if (window.scheduleBlockId) {
    const block = blocks.find((entry) => entry.id === window.scheduleBlockId);
    if (!block) return null;
    const blockRef = getBlockRef(block);
    if (!blockRef) return null;
    return { block, blockRef, identity: blockIdentityFromBlock(block, getBlockRef) };
  }

  const windowStart = window.startsAt;
  const windowEnd = window.endsAt;
  let best: {
    block: TimelineBlockDraft;
    blockRef: string;
    identity: BlockIdentity;
    overlap: number;
  } | null = null;

  for (const block of blocks) {
    const blockRef = getBlockRef(block);
    if (!blockRef) continue;
    const blockStart = parseLocalMs(block.startsAt);
    const blockEnd = parseLocalMs(block.endsAt);
    if (blockStart === null || blockEnd === null) continue;
    const overlapStart = Math.max(blockStart, windowStart);
    const overlapEnd = Math.min(blockEnd, windowEnd);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) {
      best = {
        block,
        blockRef,
        identity: blockIdentityFromBlock(block, getBlockRef),
        overlap,
      };
    }
  }

  if (!best) return null;
  return { block: best.block, blockRef: best.blockRef, identity: best.identity };
}

function partialWindowRange(window: NonNullable<AssignableResponder["partialWindows"]>[number]) {
  return {
    startsAt: toLocalDateTimeInput(new Date(window.startsAt)),
    endsAt: toLocalDateTimeInput(new Date(window.endsAt)),
  };
}

function responderCanTakeEmptyShift(
  responder: AssignableResponder,
  shift: ShiftDraftForAssign,
  shifts: ShiftDraftForAssign[],
) {
  if (remainingHourBudget(shifts, responder.userId) <= 0) return false;

  const block = blockIdentityFromShift(shift);
  if (block.blockRef || block.blockId) {
    if (userHasShiftOnBlock(shifts, responder.userId, block)) return false;
  }

  if (responder.responseStatus === "yes" || responder.responseStatus === "only_if_necessary") {
    return true;
  }
  if (responder.responseStatus !== "partial") return false;

  const blockId = shift.scheduleBlockId;
  return (
    responder.partialWindows?.some((window) => {
      if (window.scheduleBlockId && blockId) {
        return window.scheduleBlockId === blockId;
      }
      return true;
    }) ?? false
  );
}

function pickResponderForEmptyShift(
  responders: AssignableResponder[],
  shift: ShiftDraftForAssign,
  shifts: ShiftDraftForAssign[],
) {
  return sortRespondersForAssignment(
    responders.filter((responder) => responder.responseStatus !== "no"),
  ).find((responder) => responderCanTakeEmptyShift(responder, shift, shifts));
}

function rangeForEmptyShiftAssignment(
  shift: ShiftDraftForAssign,
  responder: AssignableResponder,
  maxHours: number,
): TimeRange | null {
  let range: TimeRange = { startsAt: shift.startsAt, endsAt: shift.endsAt };

  if (responder.responseStatus === "partial") {
    const blockId = shift.scheduleBlockId;
    const partialWindow = responder.partialWindows?.find((window) =>
      blockId && window.scheduleBlockId ? window.scheduleBlockId === blockId : true,
    );
    if (partialWindow) {
      range = partialWindowRange(partialWindow);
    }
  }

  return clipRangeToMaxHours(range, maxHours);
}

/** Remove duplicate assigned shifts for the same user on the same block. */
export function dedupeAssignedShifts(shifts: ShiftDraftForAssign[]) {
  const seen = new Set<string>();
  return shifts.filter((shift) => {
    const userId = shift.userId?.trim();
    if (!userId) return true;
    const blockKey = blockIdentityKey(blockIdentityFromShift(shift));
    if (!blockKey) return true;
    const dedupeKey = `${userId}::${blockKey}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

/** Assign yes/partial responders to existing empty shift slots, capped at 8 hours per person. */
export function fillEmptyShiftsFromResponses(
  shifts: ShiftDraftForAssign[],
  responders: AssignableResponder[],
  blocks: TimelineBlockDraft[] = [],
  getBlockRef: (block: TimelineBlockDraft) => string | undefined = () => undefined,
): ShiftDraftForAssign[] {
  void blocks;
  void getBlockRef;

  const next = shifts.reduce<ShiftDraftForAssign[]>((acc, shift) => {
    if (shift.userId?.trim()) {
      acc.push(shift);
      return acc;
    }

    const responder = pickResponderForEmptyShift(responders, shift, acc);
    if (!responder) {
      acc.push(shift);
      return acc;
    }

    const budget = remainingHourBudget(acc, responder.userId);
    const clipped = rangeForEmptyShiftAssignment(shift, responder, budget);
    if (!clipped) {
      acc.push(shift);
      return acc;
    }

    acc.push(
      patchShiftWithUser(
        {
          ...shift,
          notes:
            responder.responseStatus === "partial"
              ? responder.partialWindows?.find((window) =>
                  shift.scheduleBlockId && window.scheduleBlockId
                    ? window.scheduleBlockId === shift.scheduleBlockId
                    : true,
                )?.notes ?? shift.notes
              : shift.notes,
        },
        responder.userId,
        responder.name,
        clipped,
      ),
    );
    return acc;
  }, []);

  return dedupeAssignedShifts(next);
}

/** Spread a yes responder across schedule blocks up to 8 total hours. */
export function addYesResponderToAllBlocks(
  shifts: ShiftDraftForAssign[],
  blocks: TimelineBlockDraft[],
  responder: AssignableResponder,
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
): ShiftDraftForAssign[] {
  if (responder.responseStatus !== "yes") return shifts;
  return expandYesResponderAcrossBlocks(shifts, blocks, responder, getBlockRef);
}

function expandYesResponderAcrossBlocks(
  shifts: ShiftDraftForAssign[],
  blocks: TimelineBlockDraft[],
  responder: AssignableResponder,
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
) {
  let next = shifts;
  let budget = remainingHourBudget(next, responder.userId);
  if (budget <= 0) return next;

  for (const block of sortBlocksChronologically(blocks)) {
    if (budget <= 0) break;
    const blockRef = getBlockRef(block);
    if (!blockRef) continue;

    const identity = blockIdentityFromBlock(block, getBlockRef);
    if (userHasShiftOnBlock(next, responder.userId, identity)) continue;

    const clipped = clipRangeToMaxHours(
      { startsAt: block.startsAt, endsAt: block.endsAt },
      budget,
    );
    if (!clipped) continue;

    next = [
      ...next,
      makeShiftForBlock(block, blockRef, responder.userId, responder.name, clipped),
    ];
    budget = remainingHourBudget(next, responder.userId);
  }

  return dedupeAssignedShifts(next);
}

/** Spread a partial responder across their windows and other blocks as needed, up to 8 hours. */
export function addPartialResponderToMatchingBlocks(
  shifts: ShiftDraftForAssign[],
  blocks: TimelineBlockDraft[],
  responder: AssignableResponder,
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
): ShiftDraftForAssign[] {
  if (responder.responseStatus !== "partial") return shifts;
  return expandPartialResponderAcrossBlocks(shifts, blocks, responder, getBlockRef);
}

function expandPartialResponderAcrossBlocks(
  shifts: ShiftDraftForAssign[],
  blocks: TimelineBlockDraft[],
  responder: AssignableResponder,
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
) {
  let next = shifts;
  let budget = remainingHourBudget(next, responder.userId);
  if (budget <= 0) return next;

  const windows = [...(responder.partialWindows ?? [])].sort((a, b) => a.startsAt - b.startsAt);
  for (const window of windows) {
    if (budget <= 0) break;
    const match = findBlockForPartialWindow(blocks, window, getBlockRef);
    if (!match) continue;
    if (userHasShiftOnBlock(next, responder.userId, match.identity)) continue;

    const clipped = clipRangeToMaxHours(partialWindowRange(window), budget);
    if (!clipped) continue;

    next = [
      ...next,
      makeShiftForBlock(
        match.block,
        match.blockRef,
        responder.userId,
        responder.name,
        clipped,
        window.notes ?? "",
      ),
    ];
    budget = remainingHourBudget(next, responder.userId);
  }

  if (windows.length > 0 || budget <= 0) {
    return dedupeAssignedShifts(next);
  }

  for (const block of sortBlocksChronologically(blocks)) {
    if (budget <= 0) break;
    const blockRef = getBlockRef(block);
    if (!blockRef) continue;

    const identity = blockIdentityFromBlock(block, getBlockRef);
    if (userHasShiftOnBlock(next, responder.userId, identity)) continue;

    const clipped = clipRangeToMaxHours(
      { startsAt: block.startsAt, endsAt: block.endsAt },
      budget,
    );
    if (!clipped) continue;

    next = [
      ...next,
      makeShiftForBlock(block, blockRef, responder.userId, responder.name, clipped),
    ];
    budget = remainingHourBudget(next, responder.userId);
  }

  return dedupeAssignedShifts(next);
}

/** Assign a responder to the first empty shift slot, respecting the 8-hour cap. */
export function assignResponderToNextEmptyShift(
  shifts: ShiftDraftForAssign[],
  responder: AssignableResponder,
): ShiftDraftForAssign[] {
  const emptyIndex = shifts.findIndex((shift) => {
    if (shift.userId?.trim()) return false;
    return responderCanTakeEmptyShift(responder, shift, shifts);
  });
  if (emptyIndex < 0) return shifts;

  const budget = remainingHourBudget(shifts, responder.userId);
  if (budget <= 0) return shifts;

  const targetShift = shifts[emptyIndex];
  if (!targetShift) return shifts;

  const clipped = rangeForEmptyShiftAssignment(targetShift, responder, budget);
  if (!clipped) return shifts;

  const next = shifts.map((shift, index) => {
    if (index !== emptyIndex) return shift;
    return patchShiftWithUser(shift, responder.userId, responder.name, clipped);
  });

  return dedupeAssignedShifts(next);
}

/**
 * Auto-assign availability responses:
 * 1) fill empty shift slots (8hr cap per person, one shift per block per person)
 * 2) spread yes responders across remaining blocks up to 8hr
 * 3) spread partial responders across windows/blocks up to 8hr
 */
export function autoAssignRespondersToSchedule(
  shifts: ShiftDraftForAssign[],
  blocks: TimelineBlockDraft[],
  responders: AssignableResponder[],
  getBlockRef: (block: TimelineBlockDraft) => string | undefined,
): ShiftDraftForAssign[] {
  const eligible = sortRespondersForAssignment(
    responders.filter((responder) => responder.responseStatus !== "no"),
  );
  if (eligible.length === 0) return shifts;

  let next = fillEmptyShiftsFromResponses(shifts, eligible, blocks, getBlockRef);

  for (const responder of eligible) {
    if (responder.responseStatus === "yes") {
      next = expandYesResponderAcrossBlocks(next, blocks, responder, getBlockRef);
    } else if (responder.responseStatus === "partial") {
      next = expandPartialResponderAcrossBlocks(next, blocks, responder, getBlockRef);
    }
  }

  return dedupeAssignedShifts(next);
}
