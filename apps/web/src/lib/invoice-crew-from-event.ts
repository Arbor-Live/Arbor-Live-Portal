import type { Id } from "@/lib/convex-api";
import { shiftHours, type EventShiftDraft } from "@/lib/event-schedule-draft";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import type { SeriesBlockTemplate } from "@/lib/event-series-schedule";
import {
  sortedBlockTemplateOptions,
  type SeriesShiftTemplateDraft,
} from "@/lib/event-series-shifts";

export type InvoiceCrewRow = {
  label: string;
  quantity: string;
  rateUsd?: string;
  source?: "event" | "manual";
  shiftId?: Id<"eventCrewShifts">;
};

export type LinkedEventForInvoiceCrew = {
  blocks: Array<{
    _id: Id<"eventScheduleBlocks">;
    label?: string;
    blockType: string;
  }>;
  shifts: Array<{
    _id?: Id<"eventCrewShifts">;
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    role: string;
    personName?: string;
    userId?: string;
    hours: number;
  }>;
};

function blockLabelForShift(
  scheduleBlockId: Id<"eventScheduleBlocks"> | undefined,
  blockLabelById: Map<Id<"eventScheduleBlocks">, string>,
) {
  if (!scheduleBlockId) return undefined;
  return blockLabelById.get(scheduleBlockId);
}

function crewRowLabel(args: {
  blockLabel?: string;
  role: string;
  personName?: string;
  userId?: string;
}) {
  const role = args.role?.trim() || args.personName?.trim() || "Crew";
  const assignee = args.userId?.trim()
    ? args.personName?.trim() || "Assigned crew"
    : "Open slot";
  const blockPrefix = args.blockLabel ? `${args.blockLabel} — ` : "";
  return `${blockPrefix}${role} (${assignee})`;
}

export function buildCrewRowsFromShifts(
  blocks: Array<Pick<TimelineBlockDraft, "id" | "clientId" | "label" | "blockType">>,
  shifts: EventShiftDraft[],
): InvoiceCrewRow[] {
  const blockLabelByRef = new Map<string, string>();
  for (const block of blocks) {
    const ref = block.clientId ?? block.id;
    if (!ref) continue;
    blockLabelByRef.set(ref, block.label?.trim() || block.blockType);
  }
  const blockLabelById = new Map<Id<"eventScheduleBlocks">, string>();
  for (const block of blocks) {
    if (!block.id) continue;
    blockLabelById.set(block.id as Id<"eventScheduleBlocks">, block.label?.trim() || block.blockType);
  }

  return shifts
    .map((shift) => {
      const hours = shiftHours(shift);
      const blockLabel =
        (shift.scheduleBlockRef ? blockLabelByRef.get(shift.scheduleBlockRef) : undefined) ??
        blockLabelForShift(shift.scheduleBlockId, blockLabelById);
      return {
        label: crewRowLabel({
          blockLabel,
          role: shift.role,
          personName: shift.personName,
          userId: shift.userId,
        }),
        quantity: String(Math.max(0, hours)),
        source: "event" as const,
        shiftId: shift.id,
      };
    })
    .filter((row) => row.label.trim().length > 0 && Number(row.quantity) > 0);
}

export function buildCrewRowsFromLinkedEvent(linkedEvent: LinkedEventForInvoiceCrew): InvoiceCrewRow[] {
  const blockLabelById = new Map(
    linkedEvent.blocks.map((block) => [block._id, block.label || block.blockType]),
  );

  return linkedEvent.shifts
    .map((shift) => {
      const blockLabel = shift.scheduleBlockId ? blockLabelById.get(shift.scheduleBlockId) : undefined;
      return {
        label: crewRowLabel({
          blockLabel,
          role: shift.role,
          personName: shift.personName,
          userId: shift.userId,
        }),
        quantity: String(Math.max(0, Number(shift.hours ?? 0))),
        source: "event" as const,
        shiftId: shift._id,
      };
    })
    .filter((row) => row.label.trim().length > 0 && Number(row.quantity) > 0);
}

export function mergeEventCrewWithManualRows(
  eventRows: InvoiceCrewRow[],
  currentRows: InvoiceCrewRow[],
): InvoiceCrewRow[] {
  const manualRows = currentRows.filter((row) => row.source === "manual");
  return [...eventRows, ...manualRows];
}

export function buildInvoiceCrewRowsFromShiftTemplateDrafts(args: {
  drafts: SeriesShiftTemplateDraft[];
  blockTemplates: SeriesBlockTemplate[];
  billableOccurrenceCount: number;
}): InvoiceCrewRow[] {
  const blockOptions = sortedBlockTemplateOptions(args.blockTemplates);
  const occurrenceCount = Math.max(1, args.billableOccurrenceCount);

  return args.drafts
    .map((draft) => {
      const block = blockOptions.find((option) => option.index === draft.blockTemplateIndex);
      const hoursPerOccurrence = draft.durationMs / 3_600_000;
      const totalHours = hoursPerOccurrence * occurrenceCount;
      const role = draft.role.trim() || block?.label || "Crew";
      return {
        label: crewRowLabel({
          blockLabel: block?.label,
          role,
          personName: undefined,
          userId: undefined,
        }),
        quantity: String(Math.max(0, totalHours)),
        source: "event" as const,
      };
    })
    .filter((row) => row.label.trim().length > 0 && Number(row.quantity) > 0);
}
