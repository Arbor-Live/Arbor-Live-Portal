import { formatDate, formatTime, pacificDateAndTimeToMs, toPacificDateTimeInput } from "@/lib/format";
import { freeWindowsAround, type TimeWindow } from "@/lib/crew-availability";
import { timeWindowToMs } from "@/lib/performance-times";

/**
 * Crew availability by night (see `packages/backend/convex/lib/crewNights.ts`).
 * Labels and small time helpers for My Availability and the usual evenings.
 */

export type NightStatus = "free" | "partial" | "backup" | "no";
export type UsualLevel = "usually" | "sometimes" | "rarely";
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type UsualEvenings = Partial<Record<Weekday, UsualLevel>>;

/** Display order, Monday first. */
export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Asked of everyone once; other evenings are optional. */
export const ASKED_WEEKDAYS: Weekday[] = ["thursday", "friday", "saturday"];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const USUAL_LEVELS: Array<{ value: UsualLevel; label: string }> = [
  { value: "usually", label: "Usually free" },
  { value: "sometimes", label: "Sometimes" },
  { value: "rarely", label: "Rarely" },
];

export function usualChipLabel(level: UsualLevel) {
  switch (level) {
    case "usually":
      return "Usually free";
    case "sometimes":
      return "Sometimes free";
    case "rarely":
      return "Rarely free";
  }
}

export function usualChipClass(level: UsualLevel) {
  switch (level) {
    case "usually":
      return "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700 dark:text-status-emerald-300";
    case "sometimes":
      return "border-border bg-muted text-muted-foreground";
    case "rarely":
      return "border-status-rose-500/40 bg-status-rose-500/10 text-status-rose-700 dark:text-status-rose-200";
  }
}

/** "Thu rarely · Fri usually free · Sat sometimes" for a one-line summary. */
export function summarizeUsualEvenings(evenings: UsualEvenings) {
  return WEEKDAYS.filter((day) => evenings[day])
    .map((day) => `${WEEKDAY_LABELS[day].slice(0, 3)} ${USUAL_LEVELS.find((level) => level.value === evenings[day])!.label.toLowerCase()}`)
    .join(" · ");
}

/** Every asked evening has an answer. */
export function usualEveningsComplete(evenings: UsualEvenings) {
  return ASKED_WEEKDAYS.every((day) => Boolean(evenings[day]));
}

export function formatWindow(window: TimeWindow) {
  return `${formatTime(window.startsAt)}–${formatTime(window.endsAt)}`;
}

/** "Fri, Oct 16, 2026" for a night key. */
export function nightDateLabel(nightKey: string) {
  return formatDate(pacificDateAndTimeToMs(nightKey, "12:00") ?? 0);
}

type AnswerLike = {
  status: NightStatus;
  windows: TimeWindow[];
  earlySetupOnly: boolean;
  source?: "answer" | "away" | "converted";
};

/** Short label for a saved night answer. */
export function nightAnswerLabel(answer: AnswerLike) {
  switch (answer.status) {
    case "free":
      return "Free all night";
    case "partial":
      if (answer.earlySetupOnly) return "Early setup only";
      return answer.windows.length > 0 ? `Free ${answer.windows.map(formatWindow).join(", ")}` : "Part of it";
    case "backup":
      return "Backup";
    case "no":
      return answer.source === "away" ? "Away" : "Not this one";
  }
}

export function nightAnswerClass(status: NightStatus) {
  switch (status) {
    case "free":
      return "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700 dark:text-status-emerald-300";
    case "partial":
      return "border-status-blue-500/40 bg-status-blue-500/10 text-status-blue-700 dark:text-status-blue-200";
    case "backup":
      return "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700 dark:text-status-amber-300";
    case "no":
      return "border-status-rose-500/40 bg-status-rose-500/10 text-status-rose-700 dark:text-status-rose-200";
  }
}

/** `HH:mm` wall clock of an instant. */
export function timeOf(ms: number) {
  return toPacificDateTimeInput(ms).slice(11, 16);
}

/**
 * A from–to entered on a night. Times before 6 AM are after midnight, and an
 * end at or before the start runs past midnight.
 */
export function nightTimesToWindow(nightKey: string, start: string, end: string): TimeWindow | null {
  if (!start || !end) return null;
  const range = timeWindowToMs(nightKey, start, end);
  return range ? { startsAt: range[0], endsAt: range[1] } : null;
}

/** Sorted, non-overlapping union. */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = windows
    .filter((window) => window.endsAt > window.startsAt)
    .map((window) => ({ ...window }))
    .sort((a, b) => a.startsAt - b.startsAt);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && window.startsAt <= last.endsAt) last.endsAt = Math.max(last.endsAt, window.endsAt);
    else merged.push({ startsAt: window.startsAt, endsAt: window.endsAt });
  }
  return merged;
}

/** The free range with the busy times cut out. */
export function freeAroundBusy(free: TimeWindow, busy: TimeWindow[]) {
  return freeWindowsAround(free, busy);
}

/** A busy block inside an "Only part" answer ("meeting 4–5pm"). */
export type PartBusyDraft = { start: string; end: string };

/**
 * The free windows an "Only part" answer saves: from–to with the busy blocks
 * cut out. Blank busy rows are skipped; a half-filled one is an error.
 */
export function partFreeWindows(
  nightKey: string,
  from: string,
  to: string,
  busy: PartBusyDraft[],
): { free: TimeWindow[]; busy: TimeWindow[] } | { error: string } {
  const range = nightTimesToWindow(nightKey, from, to);
  if (!range) return { error: "Give a start and an end time." };
  const busyWindows: TimeWindow[] = [];
  for (const draft of busy) {
    if (!draft.start && !draft.end) continue;
    const window = nightTimesToWindow(nightKey, draft.start, draft.end);
    if (!window) return { error: "Give each busy time a start and an end." };
    busyWindows.push(window);
  }
  const free = freeAroundBusy(range, busyWindows);
  if (free.length === 0) return { error: "That leaves no free time. Choose Not this one instead." };
  return { free, busy: mergeWindows(busyWindows) };
}

/** Saved free windows back as from–to plus the gaps between them as busy blocks. */
export function partDraftFromWindows(windows: TimeWindow[]) {
  const sorted = mergeWindows(windows);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return null;
  return {
    from: timeOf(first.startsAt),
    to: timeOf(last.endsAt),
    busy: sorted.slice(1).map((window, index) => ({
      start: timeOf(sorted[index]!.endsAt),
      end: timeOf(window.startsAt),
    })),
  };
}

/** "2:30–4:00 PM and 5:00–11:00 PM". */
export function formatWindowList(windows: TimeWindow[]) {
  const labels = windows.map(formatWindow);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}
