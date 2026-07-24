import { pacificDateAndTimeToMs, pacificDateKey, PORTAL_TIMEZONE } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ShowSlotInput = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ResolvedShowSlot = ShowSlotInput & {
  startAtMs: number;
  endAtMs: number;
  endsNextDay: boolean;
};

export function combineDateAndTime(date: string, time: string): number | null {
  return pacificDateAndTimeToMs(date, time);
}

export function endsOnNextDay(startTime: string, endTime: string) {
  if (!startTime || !endTime) return false;
  return endTime <= startTime;
}

export function resolveEventEndMs(eventDate: string, startTime: string, endTime: string): number | null {
  const startMs = combineDateAndTime(eventDate, startTime);
  let endMs = combineDateAndTime(eventDate, endTime);
  if (!startMs || !endMs) return null;
  if (endMs <= startMs) {
    endMs += DAY_MS;
  }
  return endMs;
}

export function resolveShowSlot(slot: ShowSlotInput): ResolvedShowSlot | null {
  const startAtMs = combineDateAndTime(slot.date, slot.startTime);
  const endAtMs = resolveEventEndMs(slot.date, slot.startTime, slot.endTime);
  if (!startAtMs || !endAtMs) return null;
  return {
    ...slot,
    startAtMs,
    endAtMs,
    endsNextDay: endsOnNextDay(slot.startTime, slot.endTime),
  };
}

export function resolveShowSlots(slots: ShowSlotInput[]): ResolvedShowSlot[] {
  return slots
    .map(resolveShowSlot)
    .filter((slot): slot is ResolvedShowSlot => slot !== null)
    .sort((a, b) => a.startAtMs - b.startAtMs);
}

export function formatLongDate(date: string) {
  const ms = pacificDateAndTimeToMs(date, "12:00");
  if (ms == null) return date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function formatDisplayTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatEventEndTimeText(startTime: string, endTime: string) {
  const display = formatDisplayTime(endTime);
  if (endsOnNextDay(startTime, endTime)) {
    return `${display} (next day)`;
  }
  return display;
}

export function formatShowSlotTimeRange(slot: ShowSlotInput) {
  const start = formatDisplayTime(slot.startTime);
  const end = formatEventEndTimeText(slot.startTime, slot.endTime);
  return `${start} – ${end}`;
}

export function formatShowDatesFromSlots(slots: ShowSlotInput[]) {
  const uniqueDates = [...new Set(slots.map((slot) => slot.date.trim()).filter(Boolean))].sort();
  if (uniqueDates.length === 0) return "";
  if (uniqueDates.length === 1) return formatLongDate(uniqueDates[0]);
  if (uniqueDates.length === 2) {
    return `${formatLongDate(uniqueDates[0])} and ${formatLongDate(uniqueDates[1])}`;
  }
  return `${uniqueDates
    .slice(0, -1)
    .map(formatLongDate)
    .join(", ")}, and ${formatLongDate(uniqueDates[uniqueDates.length - 1])}`;
}

/** Full schedule text for staff/client views when there are multiple shows. */
export function formatShowScheduleText(slots: ShowSlotInput[]) {
  const resolved = resolveShowSlots(slots);
  if (resolved.length === 0) return "";
  if (resolved.length === 1) {
    const slot = resolved[0];
    return `${formatLongDate(slot.date)} · ${formatShowSlotTimeRange(slot)}`;
  }

  const byDate = new Map<string, ResolvedShowSlot[]>();
  for (const slot of resolved) {
    const daySlots = byDate.get(slot.date) ?? [];
    daySlots.push(slot);
    byDate.set(slot.date, daySlots);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, daySlots]) => {
      const ranges = daySlots.map(formatShowSlotTimeRange).join(", ");
      return `${formatLongDate(date)}: ${ranges}`;
    })
    .join("\n");
}

export function deriveLegacyTimeTexts(slots: ShowSlotInput[]) {
  if (slots.length === 1) {
    return {
      eventStartTimeText: formatDisplayTime(slots[0].startTime),
      eventEndTimeText: formatEventEndTimeText(slots[0].startTime, slots[0].endTime),
    };
  }
  return {
    eventStartTimeText: "Varies",
    eventEndTimeText: "Varies",
  };
}

export function getEarliestShowStartMs(slots: ShowSlotInput[]): number | null {
  const resolved = resolveShowSlots(slots);
  return resolved[0]?.startAtMs ?? null;
}

export function getLatestShowEndMs(slots: ShowSlotInput[]): number | null {
  const resolved = resolveShowSlots(slots);
  return resolved.at(-1)?.endAtMs ?? null;
}

export function getEarliestShowSlot(slots: ShowSlotInput[]): ShowSlotInput | null {
  const resolved = resolveShowSlots(slots);
  if (resolved.length === 0) return null;
  const earliest = resolved[0];
  return {
    date: earliest.date,
    startTime: earliest.startTime,
    endTime: earliest.endTime,
  };
}

export function addDaysToDateInput(date: string, days: number) {
  const ms = pacificDateAndTimeToMs(date, "12:00");
  if (ms == null) return date;
  return pacificDateKey(ms + days * DAY_MS);
}

export function createDefaultShowSlot(): ShowSlotInput {
  return {
    date: "",
    startTime: "18:00",
    endTime: "22:00",
  };
}
