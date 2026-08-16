import {
  addPacificCalendarDays,
  pacificDateAndTimeToMs,
  pacificDateKey,
  pacificDateTimeInputToMs,
  toPacificDateTimeInput,
} from "@arbor/format";

export type ScheduleBlockTimeDraft = {
  id?: string;
  clientId?: string;
  blockType: "setup" | "show" | "strike" | "custom";
  label: string;
  dayIndex: number;
  startsAt: string;
  endsAt: string;
  notes: string;
};

export const DEFAULT_SCHEDULE_BLOCK_DURATION_MS = 60 * 60 * 1000;

export function sortScheduleBlocksByTime<T extends ScheduleBlockTimeDraft>(blocks: T[]) {
  return [...blocks].sort((a, b) => {
    const aStart = pacificDateTimeInputToMs(a.startsAt);
    const bStart = pacificDateTimeInputToMs(b.startsAt);
    if (aStart == null && bStart == null) return a.dayIndex - b.dayIndex;
    if (aStart == null) return 1;
    if (bStart == null) return -1;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = pacificDateTimeInputToMs(a.endsAt) ?? 0;
    const bEnd = pacificDateTimeInputToMs(b.endsAt) ?? 0;
    if (aEnd !== bEnd) return aEnd - bEnd;
    return a.dayIndex - b.dayIndex;
  });
}

function timePartFromInput(value: string) {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? "00:00";
}

function minutesToTimePart(minutesInDay: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutesInDay)));
  const hours = Math.floor(clamped / 60) % 24;
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** New block on the event's calendar day (Day 1 by default), lasting 1 hour. */
export function createScheduleBlockDraft(args: {
  anchorStartsAt: string;
  dayIndex?: number;
  startMinutesInDay?: number;
  blockType?: ScheduleBlockTimeDraft["blockType"];
  label?: string;
}): ScheduleBlockTimeDraft | null {
  const anchorMs = pacificDateTimeInputToMs(args.anchorStartsAt);
  if (anchorMs == null) return null;
  const dayIndex = Math.max(0, args.dayIndex ?? 0);
  const dayMs = addPacificCalendarDays(anchorMs, dayIndex);
  const dateKey = pacificDateKey(dayMs);
  const time =
    args.startMinutesInDay == null
      ? timePartFromInput(args.anchorStartsAt)
      : minutesToTimePart(args.startMinutesInDay);
  const startMs = pacificDateAndTimeToMs(dateKey, time);
  if (startMs == null) return null;
  return {
    blockType: args.blockType ?? "setup",
    label: args.label ?? "New block",
    // Keep the row the user clicked; don't recompute from the event start.
    dayIndex,
    startsAt: toPacificDateTimeInput(startMs),
    endsAt: toPacificDateTimeInput(startMs + DEFAULT_SCHEDULE_BLOCK_DURATION_MS),
    notes: "",
  };
}

export function applyScheduleBlockStartChange<T extends ScheduleBlockTimeDraft>(
  block: T,
  nextStartsAt: string,
): T {
  const prevStart = pacificDateTimeInputToMs(block.startsAt);
  const prevEnd = pacificDateTimeInputToMs(block.endsAt);
  const nextStart = pacificDateTimeInputToMs(nextStartsAt);
  if (nextStart == null) return { ...block, startsAt: nextStartsAt };
  const durationMs =
    prevStart != null && prevEnd != null && prevEnd > prevStart
      ? prevEnd - prevStart
      : DEFAULT_SCHEDULE_BLOCK_DURATION_MS;
  return {
    ...block,
    startsAt: nextStartsAt,
    endsAt: toPacificDateTimeInput(nextStart + durationMs),
  };
}

export function applyScheduleBlockEndChange<T extends ScheduleBlockTimeDraft>(
  block: T,
  nextEndsAt: string,
): T {
  const prevStart = pacificDateTimeInputToMs(block.startsAt);
  const nextEnd = pacificDateTimeInputToMs(nextEndsAt);
  if (nextEnd == null) return { ...block, endsAt: nextEndsAt };
  if (prevStart == null || nextEnd <= prevStart) {
    return {
      ...block,
      startsAt: toPacificDateTimeInput(nextEnd - DEFAULT_SCHEDULE_BLOCK_DURATION_MS),
      endsAt: nextEndsAt,
    };
  }
  return { ...block, endsAt: nextEndsAt };
}
