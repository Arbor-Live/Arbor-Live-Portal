import { pacificDateTimeInputToMs } from "@arbor/format";
import {
  CREW_REGULAR_HOURS_PER_DAY,
  crewPersonKeys,
  crewTierMultiplier,
  crewTierTag,
  type CrewHoursTier,
} from "@arbor/invoice-document/crew-hours";
import { normalizeCrewLineLabel } from "@arbor/invoice-document/web";
import type { Id } from "@/lib/convex-api";
import { staffingSlots } from "@/lib/crew-shift-kinds";
import { isSectionBlockType, type ScheduleBlockType } from "@/lib/schedule-block-types";
import { shiftHours, type EventShiftDraft } from "@/lib/event-schedule-draft";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import type { SeriesBlockTemplate } from "@/lib/event-series-schedule";
import {
  sortedBlockTemplateOptions,
  type SeriesShiftTemplateDraft,
} from "@/lib/event-series-shifts";

export type CrewCompensationRateMode = "normal" | "lead" | "custom";

/** An OT day (`events.otPremium`) bills a person's first 8 hrs at this multiple (double time after). */
export const CREW_OT_MULTIPLIER = crewTierMultiplier("regular", true);

export type CrewAssigneeRate = {
  hourlyRateUsd: number;
  rateMode: CrewCompensationRateMode;
};

export type InvoiceCrewRow = {
  label: string;
  /** Billed person-hours. On hand-entered rows it's `hours × people`. */
  quantity: string;
  /** Hand-entered rows: hours each person works (e.g. a 3-hr load-in). */
  hours?: string;
  /** Hand-entered rows: people on it (4 on load-in, 2 during, 4 on strike). */
  people?: string;
  /** Billed $/hr for this row (assignee rate, open-slot default, or manual). */
  rateUsd?: string;
  source?: "event" | "manual";
  userId?: string;
  /** Assignee compensation mode — used for Lead tagging / rate resolution. */
  rateMode?: CrewCompensationRateMode;
  /** Schedule rows: a person's first 8 hrs of the day, or the hours after. */
  hoursTier?: CrewHoursTier;
  /** Multiple of `rateUsd` this row bills at (OT / double time), set per day by `applyCrewDayRates`. */
  rateMultiplier?: number;
};

/**
 * Prices a schedule row for its day: past 8 hrs bills at 1.5×, and a day
 * marked OT (`events.otPremium`) bills 1.5× / double time. Tags the label so
 * the client quote and PDF show it.
 */
export function applyCrewDayRates(row: InvoiceCrewRow, otDay: boolean): InvoiceCrewRow {
  const tier = row.hoursTier ?? "regular";
  const multiplier = crewTierMultiplier(tier, otDay);
  if (multiplier === 1) return row;
  return { ...row, label: `${row.label}${crewTierTag(tier, otDay)}`, rateMultiplier: multiplier };
}

export type LinkedEventForInvoiceCrew = {
  blocks: Array<{
    _id: Id<"eventScheduleBlocks">;
    label?: string;
    blockType: string;
    startsAt?: number;
  }>;
  shifts: Array<{
    _id?: Id<"eventCrewShifts">;
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    role: string;
    personName?: string;
    userId?: string;
    crewApplicationId?: Id<"crewApplications">;
    hours: number;
    startsAt?: number;
  }>;
};

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

/** One staffing slot, read the same way from draft and saved shifts. */
type CrewSlot = {
  id: string;
  sectionRef: string;
  sectionLabel?: string;
  sectionStartsAt: number;
  role: string;
  personName?: string;
  userId?: string;
  estimatedHourlyRateUsd?: number;
  startsAt: number;
  hours: number;
};

/** `Setup`, `Setup → Strike` for back-to-back sections, else `Setup + Strike`. */
function phaseLabel(sectionRefs: string[], labelByRef: Map<string, string | undefined>, order: string[]) {
  const labels = sectionRefs.map((ref) => labelByRef.get(ref)).filter((label): label is string => Boolean(label));
  if (labels.length <= 1) return labels[0];
  const indexes = sectionRefs.map((ref) => order.indexOf(ref));
  const backToBack = indexes.every((index, i) => index >= 0 && (i === 0 || index === indexes[i - 1]! + 1));
  return backToBack ? `${labels[0]} → ${labels[labels.length - 1]}` : labels.join(" + ");
}

/**
 * One day's crew lines, one person at a time (see `crewPersonKeys`: open slots
 * assume the same people stay on). Each person bills their first 8 hrs as one
 * row and any hours after as a second; `applyCrewDayRates` prices both.
 */
function buildCrewRowsFromSlots(
  slots: CrewSlot[],
  /** The day's Run of Show sections in time order, staffed or not. */
  sectionOrder: string[],
  options?: { ratesByUserId?: Map<string, CrewAssigneeRate>; openSlotRateUsd?: number },
): InvoiceCrewRow[] {
  const personBySlot = crewPersonKeys(slots.map((slot) => ({ ...slot, day: "day" })));
  const labelByRef = new Map(slots.map((slot) => [slot.sectionRef, slot.sectionLabel]));
  const people = new Map<string, CrewSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))) {
    const key = personBySlot.get(slot.id) ?? slot.id;
    people.set(key, [...(people.get(key) ?? []), slot]);
  }

  const rows: InvoiceCrewRow[] = [];
  for (const personSlots of people.values()) {
    const first = personSlots[0]!;
    const hours = personSlots.reduce((sum, slot) => sum + Math.max(0, slot.hours), 0);
    const billing = resolveShiftBilling({
      userId: first.userId,
      estimatedHourlyRateUsd: first.estimatedHourlyRateUsd,
      ratesByUserId: options?.ratesByUserId,
      openSlotRateUsd: options?.openSlotRateUsd,
    });
    const label = crewRowLabel({
      blockLabel: phaseLabel([...new Set(personSlots.map((slot) => slot.sectionRef))], labelByRef, sectionOrder),
      role: personSlots.find((slot) => slot.role.trim())?.role ?? "",
      personName: first.personName,
      userId: billing.userId,
      rateMode: billing.rateMode,
    });
    if (!label.trim()) continue;
    const regularHours = Math.min(hours, CREW_REGULAR_HOURS_PER_DAY);
    const tiers: Array<[CrewHoursTier, number]> = [
      ["regular", regularHours],
      ["past_regular", hours - regularHours],
    ];
    for (const [hoursTier, quantity] of tiers) {
      if (!(quantity > 0)) continue;
      rows.push({
        label,
        quantity: String(Number(quantity.toFixed(2))),
        rateUsd: billing.rateUsd,
        source: "event",
        userId: billing.userId,
        rateMode: billing.rateMode,
        hoursTier,
      });
    }
  }
  return rows;
}

function draftMs(value: string) {
  return pacificDateTimeInputToMs(value) ?? 0;
}

export function buildCrewRowsFromShifts(
  blocks: Array<Pick<TimelineBlockDraft, "id" | "clientId" | "label" | "blockType" | "startsAt">>,
  shifts: EventShiftDraft[],
  options?: {
    ratesByUserId?: Map<string, CrewAssigneeRate>;
    openSlotRateUsd?: number;
  },
): InvoiceCrewRow[] {
  const blockByRef = new Map<string, (typeof blocks)[number]>();
  for (const block of blocks) {
    const ref = block.clientId ?? block.id;
    if (ref) blockByRef.set(ref, block);
    if (block.id) blockByRef.set(block.id, block);
  }

  // Trainees shadow unpaid; they never become billed crew lines.
  const slots = staffingSlots(shifts).map((shift, index): CrewSlot => {
    const block =
      (shift.scheduleBlockRef ? blockByRef.get(shift.scheduleBlockRef) : undefined) ??
      (shift.scheduleBlockId ? blockByRef.get(shift.scheduleBlockId) : undefined);
    const sectionRef = block ? (block.clientId ?? block.id ?? `block-${index}`) : "unlinked";
    return {
      id: shift.id ?? `draft-${index}`,
      sectionRef,
      sectionLabel: block ? block.label?.trim() || block.blockType : undefined,
      sectionStartsAt: block ? draftMs(block.startsAt) : draftMs(shift.startsAt),
      role: shift.role,
      personName: shift.personName,
      userId: shift.userId,
      estimatedHourlyRateUsd: shift.estimatedHourlyRateUsd,
      startsAt: draftMs(shift.startsAt),
      hours: shiftHours(shift),
    };
  });
  const sectionOrder = blocks
    .filter((block) => isSectionBlockType(block.blockType))
    .sort((a, b) => draftMs(a.startsAt) - draftMs(b.startsAt))
    .map((block) => block.clientId ?? block.id ?? "");
  return buildCrewRowsFromSlots(slots, sectionOrder, options);
}

export function buildCrewRowsFromLinkedEvent(
  linkedEvent: LinkedEventForInvoiceCrew,
  options?: {
    ratesByUserId?: Map<string, CrewAssigneeRate>;
    openSlotRateUsd?: number;
  },
): InvoiceCrewRow[] {
  const blockById = new Map(linkedEvent.blocks.map((block) => [block._id, block]));
  const slots = staffingSlots(linkedEvent.shifts).map((shift, index): CrewSlot => {
    const block = shift.scheduleBlockId ? blockById.get(shift.scheduleBlockId) : undefined;
    return {
      id: shift._id ?? `shift-${index}`,
      sectionRef: block?._id ?? "unlinked",
      sectionLabel: block ? block.label || block.blockType : undefined,
      sectionStartsAt: block?.startsAt ?? shift.startsAt ?? 0,
      role: shift.role,
      personName: shift.personName,
      userId: shift.userId,
      startsAt: shift.startsAt ?? 0,
      hours: Number(shift.hours ?? 0),
    };
  });
  const sectionOrder = linkedEvent.blocks
    .filter((block) => isSectionBlockType(block.blockType as ScheduleBlockType))
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
    .map((block) => block._id as string);
  return buildCrewRowsFromSlots(slots, sectionOrder, options);
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
