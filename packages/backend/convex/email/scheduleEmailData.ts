import { formatDateTimeRange } from "@arbor/format";
import type { Id } from "../_generated/dataModel";
import { EVENT_TIMEZONE } from "./constants";
import { isSectionBlockType, type ScheduleBlockType } from "../lib/scheduleBlockTypes";

type ScheduleBlockLike = {
  _id: Id<"eventScheduleBlocks">;
  label: string;
  startsAt: number;
  endsAt: number;
};

export type CrewShiftLike = {
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  role: string;
  startsAt: number;
  endsAt: number;
  userId?: string;
  crewApplicationId?: Id<"crewApplications">;
};

export function formatBlockTimeRange(startsAt: number, endsAt: number, timezone: string) {
  return formatDateTimeRange(startsAt, endsAt, timezone);
}

export function formatScheduleBlockSummary(
  block: ScheduleBlockLike,
  timezone: string = EVENT_TIMEZONE,
) {
  return `${block.label} • ${formatBlockTimeRange(block.startsAt, block.endsAt, timezone)}`;
}

export function formatAssignmentSummary(
  shift: CrewShiftLike,
  blockLabelById: Map<string, string>,
  timezone: string = EVENT_TIMEZONE,
) {
  const blockLabel = shift.scheduleBlockId
    ? blockLabelById.get(shift.scheduleBlockId) ?? "Assigned block"
    : "Assigned block";
  const role = shift.role.trim();
  const timeRange = formatBlockTimeRange(shift.startsAt, shift.endsAt, timezone);
  return role ? `${blockLabel} • ${role} • ${timeRange}` : `${blockLabel} • ${timeRange}`;
}

export function shiftGroupFingerprint(shifts: CrewShiftLike[]) {
  return [...shifts]
    .sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)
    .map(
      (shift) =>
        `${shift.scheduleBlockId ?? "none"}:${shift.startsAt}:${shift.endsAt}:${shift.role.trim()}`,
    )
    .join("|");
}

export function crewAssignmentFingerprint(shifts: CrewShiftLike[], userId: string) {
  return shiftGroupFingerprint(shifts.filter((shift) => shift.userId === userId));
}

/** Crew work sections (setup, show, strike, custom); doors, soundchecks, and sets don't count. */
export function userCoversEntireSchedule(
  userShifts: Array<{ scheduleBlockId?: Id<"eventScheduleBlocks"> }>,
  allBlocks: Array<{ _id: Id<"eventScheduleBlocks">; blockType: ScheduleBlockType }>,
) {
  const blocks = allBlocks.filter((block) => isSectionBlockType(block.blockType));
  if (blocks.length === 0) return false;
  const assignedBlockIds = new Set(
    userShifts
      .map((shift) => shift.scheduleBlockId)
      .filter((value): value is Id<"eventScheduleBlocks"> => Boolean(value)),
  );
  return blocks.every((block) => assignedBlockIds.has(block._id));
}

function blockWindow(
  shift: CrewShiftLike,
  blockById: Map<Id<"eventScheduleBlocks">, ScheduleBlockLike>,
) {
  const block = shift.scheduleBlockId ? blockById.get(shift.scheduleBlockId) : undefined;
  return {
    startsAt: block?.startsAt ?? shift.startsAt,
    endsAt: block?.endsAt ?? shift.endsAt,
  };
}

function areScheduleWindowsConsecutive(previousEnd: number, nextStart: number) {
  return previousEnd === nextStart;
}

export function groupShiftsByConsecutiveBlocks(
  shifts: CrewShiftLike[],
  blocks: ScheduleBlockLike[],
) {
  if (shifts.length === 0) return [] as CrewShiftLike[][];
  const blockById = new Map(blocks.map((block) => [block._id, block]));
  const sorted = [...shifts].sort((a, b) => {
    const windowA = blockWindow(a, blockById);
    const windowB = blockWindow(b, blockById);
    return windowA.startsAt - windowB.startsAt || windowA.endsAt - windowB.endsAt;
  });

  const groups: CrewShiftLike[][] = [[sorted[0]!]];
  for (let index = 1; index < sorted.length; index += 1) {
    const previousShift = sorted[index - 1]!;
    const nextShift = sorted[index]!;
    const previousWindow = blockWindow(previousShift, blockById);
    const nextWindow = blockWindow(nextShift, blockById);
    if (areScheduleWindowsConsecutive(previousWindow.endsAt, nextWindow.startsAt)) {
      groups[groups.length - 1]!.push(nextShift);
    } else {
      groups.push([nextShift]);
    }
  }
  return groups;
}

/**
 * Who a crew invite goes to: a user id, or `application:<id>` for a trainee
 * without an account. Part of the invite UID and debounce key.
 */
export function crewAssigneeKey(shift: CrewShiftLike) {
  const userId = shift.userId?.trim();
  if (userId) return userId;
  return shift.crewApplicationId ? `application:${shift.crewApplicationId}` : undefined;
}

/**
 * A person gets one invite per run of back-to-back shifts. Invite 0 keeps the
 * UID and debounce key from when everyone got a single merged invite, so those
 * calendar entries update in place instead of duplicating.
 */
export function crewInviteUid(eventId: Id<"events">, assigneeKey: string, groupIndex: number) {
  const suffix = groupIndex === 0 ? "" : `-${groupIndex + 1}`;
  return `crew-${eventId}-${assigneeKey}${suffix}@arbor.st`;
}

export function crewInviteDebounceKey(
  template: "crew_scheduled" | "crew_unscheduled",
  eventId: Id<"events">,
  assigneeKey: string,
  groupIndex: number,
) {
  const suffix = groupIndex === 0 ? "" : `:${groupIndex + 1}`;
  return `${template}:${eventId}:${assigneeKey}${suffix}`;
}

export function shiftGroupBlockLabels(group: CrewShiftLike[], blockLabelById: Map<string, string>) {
  return [
    ...new Set(
      group.map((shift) =>
        shift.scheduleBlockId
          ? blockLabelById.get(shift.scheduleBlockId) ?? "Assigned block"
          : "Assigned block",
      ),
    ),
  ];
}

/** The calendar event for one run of back-to-back shifts (e.g. 9–10 + 10–12 → 9–12). */
export function buildCrewShiftGroupIcsEvent(args: {
  eventId: Id<"events">;
  assigneeKey: string;
  groupIndex: number;
  eventTitle: string;
  venueName?: string;
  group: CrewShiftLike[];
  blockLabelById: Map<string, string>;
  timezone: string;
  /** Event-wide revision; must increase whenever this invite is re-sent. */
  sequence: number;
}) {
  const startsAt = Math.min(...args.group.map((shift) => shift.startsAt));
  const endsAt = Math.max(...args.group.map((shift) => shift.endsAt));
  const blockLabels = shiftGroupBlockLabels(args.group, args.blockLabelById);
  const roles = [...new Set(args.group.map((shift) => shift.role.trim()).filter(Boolean))];
  const title =
    roles.length > 0
      ? `${args.eventTitle} — ${blockLabels.join(", ")} (${roles.join(", ")})`
      : `${args.eventTitle} — ${blockLabels.join(", ")}`;
  const description = args.group
    .map((shift) => formatAssignmentSummary(shift, args.blockLabelById, args.timezone))
    .join("\n");

  return {
    uid: crewInviteUid(args.eventId, args.assigneeKey, args.groupIndex),
    sequence: args.sequence,
    title,
    description,
    location: args.venueName,
    startAt: startsAt,
    endAt: endsAt,
  };
}
