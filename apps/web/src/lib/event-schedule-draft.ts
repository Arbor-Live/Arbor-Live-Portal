import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { hoursBetweenLocal } from "@/lib/crew-shift-assign";
import {
  localDateTimeInputToMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";
import { pacificDayIndexFromAnchor, pacificScheduleDayCount } from "@/lib/format";

export type EventShiftDraft = {
  id?: Id<"eventCrewShifts">;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
  expenseReportId?: Id<"eventExpenseReports">;
  role: string;
  userId?: string;
  personName: string;
  startsAt: string;
  endsAt: string;
  estimatedHourlyRateUsd?: number;
  postedToExpense: boolean;
  notes: string;
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
    return withStableRefs([
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
    ]);
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

  return withStableRefs(baseBlocks);
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

/**
 * Crew shift times mirror their schedule block's window (the backend
 * force-syncs this on every `upsertBlocks` save). Call this whenever draft
 * block times change so the UI already reflects what a save will persist.
 */
export function syncShiftsToBlockTimes<T extends ShiftBlockLink & { startsAt: string; endsAt: string }>(
  shifts: T[],
  blocks: TimelineBlockDraft[],
): T[] {
  return shifts.map((shift) => {
    const block = blocks.find((candidate) => shiftBelongsToBlock(shift, candidate));
    if (!block) return shift;
    if (shift.startsAt === block.startsAt && shift.endsAt === block.endsAt) return shift;
    return { ...shift, startsAt: block.startsAt, endsAt: block.endsAt };
  });
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
  }>,
): TimelineBlockDraft[] {
  return savedBlocks.map((row) => ({
    id: row.id,
    clientId: row.clientId ?? row.id,
    blockType: row.blockType,
    label: row.label,
    dayIndex: row.dayIndex,
    startsAt: toLocalDateTimeInput(row.startsAt),
    endsAt: toLocalDateTimeInput(row.endsAt),
    notes: row.notes ?? "",
  }));
}

export function attachShiftsToPersistedBlocks(
  shifts: EventShiftDraft[],
  blocks: TimelineBlockDraft[],
): EventShiftDraft[] {
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
