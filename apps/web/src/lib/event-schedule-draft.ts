import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { hoursBetweenLocal } from "@/lib/crew-shift-assign";

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

export function toLocalDateTimeInput(value: number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

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
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
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
  const showStart = new Date(startAt);
  const showEnd = new Date(endAt);
  const setupStart = new Date(showStart.getTime() - 3 * 60 * 60 * 1000);
  const strikeEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
  const deliveryStart = new Date(showStart.getTime() - 2 * 60 * 60 * 1000);
  const returnEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
  const anchorDayStart = new Date(showStart.getFullYear(), showStart.getMonth(), showStart.getDate()).getTime();
  const setupDayIndex = Math.max(0, Math.floor((setupStart.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)));
  const showDayIndex = 0;
  const strikeDayIndex = Math.max(0, Math.floor((showEnd.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)));
  const deliveryDayIndex = Math.max(0, Math.floor((deliveryStart.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)));
  const returnDayIndex = Math.max(0, Math.floor((showEnd.getTime() - anchorDayStart) / (24 * 60 * 60 * 1000)));

  if (eventType === "Dry Hire") {
    const outboundLabel = rentalFulfillmentMode === "will_call" ? "Check-out Window" : "Drop-off Window";
    const returnLabel = rentalFulfillmentMode === "will_call" ? "Return Window" : "Pickup Window";
    return withStableRefs([
      {
        blockType: "setup",
        label: outboundLabel,
        dayIndex: deliveryDayIndex,
        startsAt: toLocalDateTimeInput(deliveryStart),
        endsAt: toLocalDateTimeInput(showStart),
        notes: "",
      },
      {
        blockType: "strike",
        label: returnLabel,
        dayIndex: returnDayIndex,
        startsAt: toLocalDateTimeInput(showEnd),
        endsAt: toLocalDateTimeInput(returnEnd),
        notes: "",
      },
    ]);
  }

  const baseBlocks: TimelineBlockDraft[] = [
    {
      blockType: "setup",
      label: "Setup",
      dayIndex: setupDayIndex,
      startsAt: toLocalDateTimeInput(setupStart),
      endsAt: toLocalDateTimeInput(showStart),
      notes: "",
    },
    {
      blockType: "strike",
      label: "Strike",
      dayIndex: strikeDayIndex,
      startsAt: toLocalDateTimeInput(showEnd),
      endsAt: toLocalDateTimeInput(strikeEnd),
      notes: "",
    },
  ];

  if (eventType === "Crewed Event") {
    baseBlocks.splice(1, 0, {
      blockType: "show",
      label: "Show",
      dayIndex: showDayIndex,
      startsAt: toLocalDateTimeInput(showStart),
      endsAt: toLocalDateTimeInput(showEnd),
      notes: "",
    });
  }

  return withStableRefs(baseBlocks);
}

export function shiftHours(shift: Pick<EventShiftDraft, "startsAt" | "endsAt">) {
  return hoursBetweenLocal(shift.startsAt, shift.endsAt);
}

export function shiftBelongsToBlock(shift: EventShiftDraft, block: TimelineBlockDraft) {
  const blockRef = getBlockRef(block);
  if (blockRef && shift.scheduleBlockRef === blockRef) return true;
  if (block.id && shift.scheduleBlockId === block.id) return true;
  if (block.id && shift.scheduleBlockRef === block.id) return true;
  return false;
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
