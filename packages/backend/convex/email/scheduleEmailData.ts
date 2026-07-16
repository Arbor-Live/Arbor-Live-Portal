import { formatDateTimeRange } from "@arbor/format";
import type { Id } from "../_generated/dataModel";
import { EVENT_TIMEZONE } from "./constants";

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

export function userCoversEntireSchedule(
  userShifts: Array<{ scheduleBlockId?: Id<"eventScheduleBlocks"> }>,
  blocks: Array<{ _id: Id<"eventScheduleBlocks"> }>,
) {
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

export function buildMergedIcsEventForShiftGroup(args: {
  eventId: Id<"events">;
  userId: string;
  groupIndex: number;
  eventTitle: string;
  venueName?: string;
  group: CrewShiftLike[];
  blockLabelById: Map<string, string>;
  timezone: string;
}) {
  const startsAt = Math.min(...args.group.map((shift) => shift.startsAt));
  const endsAt = Math.max(...args.group.map((shift) => shift.endsAt));
  const blockLabels = [
    ...new Set(
      args.group.map((shift) =>
        shift.scheduleBlockId
          ? args.blockLabelById.get(shift.scheduleBlockId) ?? "Assigned block"
          : "Assigned block",
      ),
    ),
  ];
  const roles = [...new Set(args.group.map((shift) => shift.role.trim()).filter(Boolean))];
  const title =
    roles.length > 0
      ? `${args.eventTitle} — ${blockLabels.join(", ")} (${roles.join(", ")})`
      : `${args.eventTitle} — ${blockLabels.join(", ")}`;
  const description = args.group
    .map((shift) => formatAssignmentSummary(shift, args.blockLabelById, args.timezone))
    .join("\n");

  return {
    // One VEVENT per person/event so calendar clients that only read the first
    // invite still get a span covering all assigned windows (e.g. 9–10 + 11–12 → 9–12).
    uid: `crew-${args.eventId}-${args.userId}@arbor.st`,
    title,
    description,
    location: args.venueName,
    startAt: startsAt,
    endAt: endsAt,
  };
}

/** Single calendar invite spanning every assigned shift for a user on an event. */
export function buildSingleIcsEventForUserShifts(args: {
  eventId: Id<"events">;
  userId: string;
  eventTitle: string;
  venueName?: string;
  shifts: CrewShiftLike[];
  blockLabelById: Map<string, string>;
  timezone: string;
}) {
  return buildMergedIcsEventForShiftGroup({
    eventId: args.eventId,
    userId: args.userId,
    groupIndex: 0,
    eventTitle: args.eventTitle,
    venueName: args.venueName,
    group: args.shifts,
    blockLabelById: args.blockLabelById,
    timezone: args.timezone,
  });
}
