import { pacificDateTimeInputToMs } from "@arbor/format";
import {
  allocateCrewHours,
  crewCountableHours,
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
    /** Without an end the shift runs `hours` from its start. */
    endsAt?: number;
    _creationTime?: number;
  }>;
};

/**
 * A crew member's shift outside the day being billed (another event, or
 * another day of this booking). Their time already counted there isn't billed
 * again here (`crewCountableHours`: shared time belongs to the shift that
 * starts first).
 */
export type CrewOtherShift = {
  id: string;
  userId?: string;
  startsAt: number;
  endsAt: number;
  hours?: number;
  /** `_creationTime`: breaks a tie on start. */
  createdAt?: number;
  /** A cancelled event's shift never covers anyone's time. */
  cancelled?: boolean;
};

/** Other events' overlapping shifts, from `eventCrew.listCrewConflictsForEvent` (cancelled already left out). */
export function crewOtherShiftsFromConflicts(
  conflicts: ReadonlyArray<{
    userId: string;
    startsAt: number;
    endsAt: number;
    shiftId?: string;
    shiftCreationTime?: number;
    hours?: number;
  }>,
): CrewOtherShift[] {
  return conflicts.map((conflict, index) => ({
    id: conflict.shiftId ?? `conflict-${index}`,
    userId: conflict.userId,
    startsAt: conflict.startsAt,
    endsAt: conflict.endsAt,
    hours: conflict.hours,
    createdAt: conflict.shiftCreationTime,
  }));
}

export type CrewRowOptions = {
  ratesByUserId?: Map<string, CrewAssigneeRate>;
  openSlotRateUsd?: number;
  /** The crew's shifts elsewhere; omit to only count overlaps within this day. */
  otherShifts?: CrewOtherShift[];
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
  endsAt: number;
  /** `_creationTime`; unset for a slot not saved yet. */
  createdAt?: number;
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
  options?: CrewRowOptions,
): InvoiceCrewRow[] {
  const personBySlot = crewPersonKeys(slots.map((slot) => ({ ...slot, day: "day" })));
  // A person on two shifts at once bills the shared time once, on the shift
  // that starts first (here or elsewhere); the later one bills only the rest.
  const countable = crewCountableHours([
    ...slots,
    ...(options?.otherShifts ?? []).map((other) => ({
      ...other,
      id: `other:${other.id}`,
      hours: other.hours ?? Math.max(0, other.endsAt - other.startsAt) / 3_600_000,
    })),
  ]);
  const billedHours = (slot: CrewSlot) => countable.get(slot.id) ?? Math.max(0, slot.hours);
  const labelByRef = new Map(slots.map((slot) => [slot.sectionRef, slot.sectionLabel]));
  const people = new Map<string, CrewSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))) {
    const key = personBySlot.get(slot.id) ?? slot.id;
    people.set(key, [...(people.get(key) ?? []), slot]);
  }

  // Fill each person's day slot by slot (as event crew cost does), so a slot
  // stamped at its own rate bills its own hours at that rate.
  const hoursBySlot = allocateCrewHours(
    slots.map((slot) => ({ ...slot, hours: billedHours(slot), personKey: personBySlot.get(slot.id) ?? slot.id })),
  );
  const rows: InvoiceCrewRow[] = [];
  for (const personSlots of people.values()) {
    const first = personSlots[0]!;
    const firstBilling = resolveShiftBilling({
      userId: first.userId,
      ratesByUserId: options?.ratesByUserId,
    });
    const label = crewRowLabel({
      blockLabel: phaseLabel([...new Set(personSlots.map((slot) => slot.sectionRef))], labelByRef, sectionOrder),
      role: personSlots.find((slot) => slot.role.trim())?.role ?? "",
      personName: first.personName,
      userId: firstBilling.userId,
      rateMode: firstBilling.rateMode,
    });
    if (!label.trim()) continue;
    // One row per tier and rate: usually two (first 8 hrs, the rest).
    const personRows = new Map<string, InvoiceCrewRow & { hoursValue: number }>();
    for (const slot of personSlots) {
      const billing = resolveShiftBilling({
        userId: slot.userId,
        estimatedHourlyRateUsd: slot.estimatedHourlyRateUsd,
        ratesByUserId: options?.ratesByUserId,
        openSlotRateUsd: options?.openSlotRateUsd,
      });
      const split = hoursBySlot.get(slot.id);
      const tiers: Array<[CrewHoursTier, number]> = [
        ["regular", split?.regularHours ?? billedHours(slot)],
        ["past_regular", split?.pastRegularHours ?? 0],
      ];
      for (const [hoursTier, hours] of tiers) {
        if (!(hours > 0)) continue;
        const key = `${hoursTier}|${billing.rateUsd ?? ""}`;
        const row = personRows.get(key);
        if (row) row.hoursValue += hours;
        else
          personRows.set(key, {
            label,
            quantity: "",
            hoursValue: hours,
            rateUsd: billing.rateUsd,
            source: "event",
            userId: billing.userId,
            rateMode: billing.rateMode,
            hoursTier,
          });
      }
    }
    const tierOrder: CrewHoursTier[] = ["regular", "past_regular"];
    for (const { hoursValue, ...row } of [...personRows.values()].sort(
      (a, b) => tierOrder.indexOf(a.hoursTier!) - tierOrder.indexOf(b.hoursTier!),
    )) {
      rows.push({ ...row, quantity: String(Number(hoursValue.toFixed(2))) });
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
  options?: CrewRowOptions & {
    /** Saved shifts' `_creationTime` by id (drafts don't carry it); breaks a tie on start. */
    shiftCreationTimes?: ReadonlyMap<string, number>;
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
      endsAt: draftMs(shift.endsAt),
      createdAt: shift.id ? options?.shiftCreationTimes?.get(shift.id) : undefined,
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
  options?: CrewRowOptions,
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
      // A shift with no saved time can't be placed, so it never overlaps.
      endsAt:
        shift.startsAt === undefined
          ? 0
          : (shift.endsAt ?? shift.startsAt + Math.max(0, Number(shift.hours ?? 0)) * 3_600_000),
      createdAt: shift._creationTime,
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
