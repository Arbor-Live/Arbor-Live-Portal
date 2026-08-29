import { normalizeCrewLineLabel } from "@arbor/invoice-document/web";
import type { Id } from "@/lib/convex-api";
import { shiftHours, type EventShiftDraft } from "@/lib/event-schedule-draft";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import type { SeriesBlockTemplate } from "@/lib/event-series-schedule";
import {
  sortedBlockTemplateOptions,
  type SeriesShiftTemplateDraft,
} from "@/lib/event-series-shifts";

export type CrewCompensationRateMode = "normal" | "lead" | "custom";

export type CrewAssigneeRate = {
  hourlyRateUsd: number;
  rateMode: CrewCompensationRateMode;
};

export type InvoiceCrewRow = {
  label: string;
  quantity: string;
  /** Billed $/hr for this row (assignee rate, open-slot default, or manual). */
  rateUsd?: string;
  source?: "event" | "manual";
  shiftId?: Id<"eventCrewShifts">;
  userId?: string;
  /** Assignee compensation mode — used for Lead tagging / rate resolution. */
  rateMode?: CrewCompensationRateMode;
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

function formatAssigneeName(personName: string | undefined, rateMode: CrewCompensationRateMode | undefined) {
  const name = personName?.trim() || "Assigned crew";
  return rateMode === "lead" ? `${name} (Lead)` : name;
}

function namesMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Line label: `Setup — Sound (Alex (Lead))`.
 * When role is empty or just the assignee's name, skip the redundant wrapper
 * (`Alex (Alex (Lead))` → `Alex (Lead)`).
 */
function crewRowLabel(args: {
  blockLabel?: string;
  role: string;
  personName?: string;
  userId?: string;
  rateMode?: CrewCompensationRateMode;
}) {
  const role = args.role?.trim() ?? "";
  const personName = args.personName?.trim() ?? "";
  const assignee = args.userId?.trim()
    ? formatAssigneeName(args.personName, args.rateMode)
    : "Open slot";
  const blockPrefix = args.blockLabel ? `${args.blockLabel} — ` : "";
  const roleIsJustName = Boolean(role && personName && namesMatch(role, personName));
  if (!role || roleIsJustName) {
    return normalizeCrewLineLabel(`${blockPrefix}${assignee}`);
  }
  return normalizeCrewLineLabel(`${blockPrefix}${role} (${assignee})`);
}

function resolveShiftBilling(args: {
  userId?: string;
  estimatedHourlyRateUsd?: number;
  ratesByUserId?: Map<string, CrewAssigneeRate>;
  openSlotRateUsd?: number;
}): {
  userId?: string;
  rateMode?: CrewCompensationRateMode;
  rateUsd?: string;
} {
  const userId = args.userId?.trim() || undefined;
  if (userId) {
    const assignee = args.ratesByUserId?.get(userId);
    if (assignee && assignee.hourlyRateUsd > 0) {
      return {
        userId,
        rateMode: assignee.rateMode,
        rateUsd: String(assignee.hourlyRateUsd),
      };
    }
    return { userId };
  }
  const openRate =
    args.estimatedHourlyRateUsd !== undefined && args.estimatedHourlyRateUsd > 0
      ? args.estimatedHourlyRateUsd
      : args.openSlotRateUsd;
  return {
    rateUsd: openRate !== undefined && openRate > 0 ? String(openRate) : undefined,
  };
}

export function buildCrewRowsFromShifts(
  blocks: Array<Pick<TimelineBlockDraft, "id" | "clientId" | "label" | "blockType">>,
  shifts: EventShiftDraft[],
  options?: {
    ratesByUserId?: Map<string, CrewAssigneeRate>;
    openSlotRateUsd?: number;
  },
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
      const billing = resolveShiftBilling({
        userId: shift.userId,
        estimatedHourlyRateUsd: shift.estimatedHourlyRateUsd,
        ratesByUserId: options?.ratesByUserId,
        openSlotRateUsd: options?.openSlotRateUsd,
      });
      return {
        label: crewRowLabel({
          blockLabel,
          role: shift.role,
          personName: shift.personName,
          userId: billing.userId,
          rateMode: billing.rateMode,
        }),
        quantity: String(Math.max(0, hours)),
        rateUsd: billing.rateUsd,
        source: "event" as const,
        shiftId: shift.id,
        userId: billing.userId,
        rateMode: billing.rateMode,
      };
    })
    .filter((row) => row.label.trim().length > 0 && Number(row.quantity) > 0);
}

export function buildCrewRowsFromLinkedEvent(
  linkedEvent: LinkedEventForInvoiceCrew,
  options?: {
    ratesByUserId?: Map<string, CrewAssigneeRate>;
    openSlotRateUsd?: number;
  },
): InvoiceCrewRow[] {
  const blockLabelById = new Map(
    linkedEvent.blocks.map((block) => [block._id, block.label || block.blockType]),
  );

  return linkedEvent.shifts
    .map((shift) => {
      const blockLabel = shift.scheduleBlockId ? blockLabelById.get(shift.scheduleBlockId) : undefined;
      const billing = resolveShiftBilling({
        userId: shift.userId,
        ratesByUserId: options?.ratesByUserId,
        openSlotRateUsd: options?.openSlotRateUsd,
      });
      return {
        label: crewRowLabel({
          blockLabel,
          role: shift.role,
          personName: shift.personName,
          userId: billing.userId,
          rateMode: billing.rateMode,
        }),
        quantity: String(Math.max(0, Number(shift.hours ?? 0))),
        rateUsd: billing.rateUsd,
        source: "event" as const,
        shiftId: shift._id,
        userId: billing.userId,
        rateMode: billing.rateMode,
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
  openSlotRateUsd?: number;
}): InvoiceCrewRow[] {
  const blockOptions = sortedBlockTemplateOptions(args.blockTemplates);
  const occurrenceCount = Math.max(1, args.billableOccurrenceCount);

  return args.drafts
    .map((draft) => {
      const block = blockOptions.find((option) => option.index === draft.blockTemplateIndex);
      const hoursPerOccurrence = draft.durationMs / 3_600_000;
      const totalHours = hoursPerOccurrence * occurrenceCount;
      const role = draft.role.trim() || block?.label || "Crew";
      const draftRate = Number(draft.estimatedHourlyRateUsd);
      const openRate =
        Number.isFinite(draftRate) && draftRate > 0 ? draftRate : args.openSlotRateUsd;
      return {
        label: crewRowLabel({
          blockLabel: block?.label,
          role,
          personName: undefined,
          userId: undefined,
        }),
        quantity: String(Math.max(0, totalHours)),
        rateUsd: openRate !== undefined && openRate > 0 ? String(openRate) : undefined,
        source: "event" as const,
      };
    })
    .filter((row) => row.label.trim().length > 0 && Number(row.quantity) > 0);
}
