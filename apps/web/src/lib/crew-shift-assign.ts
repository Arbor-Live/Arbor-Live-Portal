import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import {
  localDateTimeInputToMs,
  SECTION_AVAILABILITY_RANK,
  sectionAvailability,
  windowsOverlap,
  type ResponderAvailability,
  type SectionAvailabilityLevel,
  type SectionForAvailability,
} from "@/lib/crew-availability";
import { isOpenSlot } from "@/lib/crew-shift-kinds";

export type ShiftDraftForAssign = {
  id?: Id<"eventCrewShifts">;
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  scheduleBlockRef?: string;
  role: string;
  userId?: string;
  crewApplicationId?: Id<"crewApplications">;
  personName: string;
  startsAt: string;
  endsAt: string;
  postedToExpense: boolean;
  notes: string;
  timesOverridden?: boolean;
};

export type AssignableResponder = ResponderAvailability & {
  userId: string;
  name: string;
  image?: string;
  respondedAt?: number;
  notes?: string;
  scheduleChanged?: boolean;
};

/** Another event's shift overlapping this event (from `eventCrew.listCrewConflictsForEvent`). */
export type CrewConflict = {
  userId: string;
  eventId: string;
  eventTitle: string;
  startsAt: number;
  endsAt: number;
};

export type SectionCandidate = {
  userId: string;
  name: string;
  image?: string;
  level: SectionAvailabilityLevel;
  detail?: string;
  conflicts: CrewConflict[];
  responder?: AssignableResponder;
};

type GetBlockRef = (block: TimelineBlockDraft) => string | undefined;

export function hoursBetweenLocal(startsAt: string, endsAt: string) {
  const start = localDateTimeInputToMs(startsAt);
  const end = localDateTimeInputToMs(endsAt);
  if (start === null || end === null || end <= start) return 0;
  return Number(((end - start) / 3_600_000).toFixed(2));
}

function userAssignedHours(shifts: ShiftDraftForAssign[], userId: string) {
  return shifts
    .filter((shift) => shift.userId?.trim() === userId)
    .reduce((total, shift) => total + hoursBetweenLocal(shift.startsAt, shift.endsAt), 0);
}

function onBlock(shift: ShiftDraftForAssign, block: TimelineBlockDraft, getBlockRef: GetBlockRef) {
  const blockRef = getBlockRef(block);
  if (blockRef && shift.scheduleBlockRef === blockRef) return true;
  if (block.id && (shift.scheduleBlockId === block.id || shift.scheduleBlockRef === block.id)) {
    return true;
  }
  return false;
}

export function sectionWindow(block: TimelineBlockDraft): SectionForAvailability | null {
  const startsAt = localDateTimeInputToMs(block.startsAt);
  const endsAt = localDateTimeInputToMs(block.endsAt);
  if (startsAt === null || endsAt === null || endsAt <= startsAt) return null;
  return { id: block.id, startsAt, endsAt };
}

export function conflictsDuring(
  conflicts: CrewConflict[],
  userId: string,
  window: { startsAt: number; endsAt: number },
) {
  return conflicts.filter((conflict) => conflict.userId === userId && windowsOverlap(conflict, window));
}

/** Saved shift hours per person this quarter (from `userCards.listShiftHours`). */
export type QuarterHoursById = ReadonlyMap<string, number>;

/**
 * Everyone who could go on this section, best fit first: availability, then
 * not booked elsewhere, then whoever has the fewest hours this quarter (so
 * work spreads out), then the fewest hours on this event. People already on
 * the section are left out.
 */
export function rankCandidatesForSection(args: {
  block: TimelineBlockDraft;
  people: Array<{ userId: string; name: string; image?: string }>;
  responders: AssignableResponder[];
  shifts: ShiftDraftForAssign[];
  conflicts: CrewConflict[];
  getBlockRef: GetBlockRef;
  quarterHours?: QuarterHoursById;
}): SectionCandidate[] {
  const window = sectionWindow(args.block);
  const responderById = new Map(args.responders.map((responder) => [responder.userId, responder]));
  const onSection = new Set(
    args.shifts
      .filter((shift) => onBlock(shift, args.block, args.getBlockRef))
      .map((shift) => shift.userId?.trim())
      .filter((userId): userId is string => Boolean(userId)),
  );
  const hours = new Map<string, number>();
  const hoursFor = (userId: string) => {
    if (!hours.has(userId)) hours.set(userId, userAssignedHours(args.shifts, userId));
    return hours.get(userId) ?? 0;
  };

  return args.people
    .filter((person) => !onSection.has(person.userId))
    .map((person) => {
      const responder = responderById.get(person.userId);
      const availability = window
        ? sectionAvailability(responder, window)
        : { level: responder ? ("available" as const) : ("pending" as const) };
      return {
        userId: person.userId,
        name: person.name,
        image: person.image,
        level: availability.level,
        detail: "detail" in availability ? availability.detail : undefined,
        conflicts: window ? conflictsDuring(args.conflicts, person.userId, window) : [],
        responder,
      };
    })
    .sort(
      (a, b) =>
        SECTION_AVAILABILITY_RANK[a.level] - SECTION_AVAILABILITY_RANK[b.level] ||
        a.conflicts.length - b.conflicts.length ||
        (args.quarterHours?.get(a.userId) ?? 0) - (args.quarterHours?.get(b.userId) ?? 0) ||
        hoursFor(a.userId) - hoursFor(b.userId) ||
        (a.responder?.respondedAt ?? Infinity) - (b.responder?.respondedAt ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
}

/** Put someone on a section: the first open slot there, or a new slot. */
export function assignPersonToSection<T extends ShiftDraftForAssign>(
  shifts: T[],
  block: TimelineBlockDraft,
  person: { userId: string; name: string },
  getBlockRef: GetBlockRef,
): T[] {
  const openIndex = shifts.findIndex((shift) => onBlock(shift, block, getBlockRef) && isOpenSlot(shift));
  if (openIndex >= 0) {
    return shifts.map((shift, index) =>
      index === openIndex ? { ...shift, userId: person.userId, personName: person.name } : shift,
    );
  }
  const slot: ShiftDraftForAssign = {
    scheduleBlockId: block.id as Id<"eventScheduleBlocks"> | undefined,
    scheduleBlockRef: getBlockRef(block),
    role: "",
    userId: person.userId,
    personName: person.name,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    postedToExpense: false,
    notes: "",
  };
  return [...shifts, slot as T];
}

/**
 * Fill open slots from availability, section by section in time order.
 * Only people who said they can work the section (fully or partly) and aren't
 * booked elsewhere are used; backups and non-responders are left for a human
 * call. Never creates slots and never touches trainee shifts.
 */
export function fillOpenSlotsFromAvailability<T extends ShiftDraftForAssign>(args: {
  shifts: T[];
  blocks: TimelineBlockDraft[];
  responders: AssignableResponder[];
  conflicts: CrewConflict[];
  getBlockRef: GetBlockRef;
  quarterHours?: QuarterHoursById;
}): { shifts: T[]; filled: number } {
  let next = args.shifts;
  let filled = 0;
  const people = args.responders.map((responder) => ({
    userId: responder.userId,
    name: responder.name,
    image: responder.image,
  }));
  const ordered = [...args.blocks].sort(
    (a, b) => (localDateTimeInputToMs(a.startsAt) ?? 0) - (localDateTimeInputToMs(b.startsAt) ?? 0),
  );

  for (const block of ordered) {
    for (;;) {
      const openIndex = next.findIndex(
        (shift) => onBlock(shift, block, args.getBlockRef) && isOpenSlot(shift),
      );
      if (openIndex < 0) break;
      const candidate = rankCandidatesForSection({
        block,
        people,
        responders: args.responders,
        shifts: next,
        conflicts: args.conflicts,
        getBlockRef: args.getBlockRef,
        quarterHours: args.quarterHours,
      }).find(
        (entry) =>
          (entry.level === "available" || entry.level === "part") && entry.conflicts.length === 0,
      );
      if (!candidate) break;
      next = next.map((shift, index) =>
        index === openIndex
          ? { ...shift, userId: candidate.userId, personName: candidate.name }
          : shift,
      );
      filled += 1;
    }
  }

  return { shifts: next, filled };
}

/** Headcount for a section: add open slots, or remove open ones (never filled ones). */
export function setSectionHeadcount<T extends ShiftDraftForAssign>(
  shifts: T[],
  block: TimelineBlockDraft,
  headcount: number,
  getBlockRef: GetBlockRef,
): T[] {
  const onSection = shifts.filter(
    (shift) => onBlock(shift, block, getBlockRef) && !shift.crewApplicationId,
  );
  const filled = onSection.filter((shift) => !isOpenSlot(shift)).length;
  const target = Math.max(filled, Math.max(0, Math.floor(headcount)));
  const current = onSection.length;
  if (target === current) return shifts;
  if (target > current) {
    const added = Array.from({ length: target - current }, () => ({
      scheduleBlockId: block.id as Id<"eventScheduleBlocks"> | undefined,
      scheduleBlockRef: getBlockRef(block),
      role: "",
      personName: "",
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      postedToExpense: false,
      notes: "",
    })) as T[];
    return [...shifts, ...added];
  }
  // Drop open slots from the end of the section first.
  let toRemove = current - target;
  const kept = [...shifts];
  for (let index = kept.length - 1; index >= 0 && toRemove > 0; index -= 1) {
    const shift = kept[index];
    if (shift && onBlock(shift, block, getBlockRef) && isOpenSlot(shift)) {
      kept.splice(index, 1);
      toRemove -= 1;
    }
  }
  return kept;
}
