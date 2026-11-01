import { dateTimeFormat, formatTime, PORTAL_TIMEZONE, quarterWeek } from "@/lib/format";

export const FLAG_REASON_LABELS = {
  missing: "Missing",
  damaged: "Damaged",
  low: "Running low",
  other: "Other",
} as const;

export type FlagReason = keyof typeof FLAG_REASON_LABELS;

/** Every shift on a hash has this role; the server sets it. */
export const HASH_ROLE = "Hash";

export const HASH_STATUS_PILLS = {
  scheduled: { label: "Not started", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
  in_progress: { label: "In progress", tone: "blue" },
  finished: { label: "Finished", tone: "emerald" },
  lapsed: { label: "Never ran", tone: "neutral" },
} as const;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "Tue, Nov 17" for a day key, without the viewer's timezone anywhere near it. */
export function hashDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return dateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year!, month! - 1, day!)),
  );
}

function compactTime(ms: number) {
  return formatTime(ms).replace(":00", "").replace(" ", "").toLowerCase();
}

/** "4–5pm", "4:30–5:30pm", "11am–12:30pm". */
export function hashTimeRange(startsAt: number, endsAt: number) {
  const start = compactTime(startsAt);
  const end = compactTime(endsAt);
  const samePeriod = start.slice(-2) === end.slice(-2);
  return `${samePeriod ? start.slice(0, -2) : start}–${end}`;
}

/** The `HH:mm` a time is at in the portal timezone, for a time input. */
export function hashStartTime(ms: number) {
  return dateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

/** What saving a corrected list does to each person, for the confirm. */
export function attendanceConfirmText({ added, removed }: { added: string[]; removed: string[] }) {
  const sentences = [];
  if (added.length > 0) sentences.push(`${added.join(", ")} will get credit and pay.`);
  if (removed.length > 0) sentences.push(`${removed.join(", ")} will lose this shift and its pay, and need a hash again.`);
  return sentences.join(" ");
}

/** Why a date falls in a week with no hash ("Thanksgiving"), or null. */
export function offWeekLabel(dateKey: string) {
  const week = quarterWeek(dateKey);
  return week && week.kind !== "week" ? week.label : null;
}

/** The weekly slot as a sentence: "Tuesdays, 4–5pm". */
export function hashSlotLabel(settings: { weekday: number; startTime: string; durationMinutes: number }) {
  const [hours, minutes] = settings.startTime.split(":").map(Number);
  const start = Date.UTC(2026, 0, 1, hours!, minutes!);
  const utcTime = (ms: number) =>
    dateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" })
      .format(new Date(ms))
      .replace(":00", "")
      .replace(/\s/g, "")
      .toLowerCase();
  const from = utcTime(start);
  const to = utcTime(start + settings.durationMinutes * 60_000);
  const range = `${from.slice(-2) === to.slice(-2) ? from.slice(0, -2) : from}–${to}`;
  return `${WEEKDAYS[settings.weekday]}s, ${range}`;
}
