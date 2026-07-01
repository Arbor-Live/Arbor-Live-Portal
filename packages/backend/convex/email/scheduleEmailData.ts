import type { Id } from "../_generated/dataModel";
import { EVENT_TIMEZONE } from "./constants";

type ScheduleBlockLike = {
  _id?: Id<"eventScheduleBlocks">;
  label: string;
  startsAt: number;
  endsAt: number;
};

type CrewShiftLike = {
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  role: string;
  startsAt: number;
  endsAt: number;
};

export function formatBlockTimeRange(startsAt: number, endsAt: number, timezone: string) {
  const start = new Date(startsAt).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(endsAt).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${start} – ${end}`;
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

export function crewAssignmentFingerprint(
  shifts: Array<{
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    role: string;
    startsAt: number;
    endsAt: number;
    userId?: string;
  }>,
  userId: string,
) {
  return shifts
    .filter((shift) => shift.userId === userId)
    .sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)
    .map(
      (shift) =>
        `${shift.scheduleBlockId ?? "none"}:${shift.startsAt}:${shift.endsAt}:${shift.role.trim()}`,
    )
    .join("|");
}
