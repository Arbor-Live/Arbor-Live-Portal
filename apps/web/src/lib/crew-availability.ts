import {
  formatDateTime,
  formatTime,
  pacificDateKey,
  pacificDateTimeInputToMs,
  pacificEndOfDayMs,
  pacificStartOfDayMs,
  toPacificDateTimeInput,
} from "@/lib/format";

export type CrewAvailabilityResponseStatus = "yes" | "partial" | "only_if_necessary" | "no";

/** Mirrors `lib/crewTeams.ts`: the inbox, nav badge, and weekly digest all use it. */
export const DEFAULT_AVAILABILITY_WEEKS = 3;
export const EXTENDED_AVAILABILITY_WEEKS = 12;
/** The admin board opens on the same window crew are asked about. */
export const ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS = DEFAULT_AVAILABILITY_WEEKS;

/** Calendar date (`YYYY-MM-DD`) in portal timezone. */
export function toLocalDateInput(date: Date | number) {
  const ms = typeof date === "number" ? date : date.getTime();
  return pacificDateKey(ms);
}

export function startOfLocalDay(date: Date | number) {
  const ms = typeof date === "number" ? date : date.getTime();
  const [year, month, day] = pacificDateKey(ms).split("-").map(Number);
  return pacificStartOfDayMs(year, month, day);
}

export function endOfLocalDay(date: Date | number) {
  const ms = typeof date === "number" ? date : date.getTime();
  const [year, month, day] = pacificDateKey(ms).split("-").map(Number);
  return pacificEndOfDayMs(year, month, day);
}

export function parseLocalDateInput(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = pacificStartOfDayMs(year, month, day);
  return new Date(ms);
}

export function getDefaultAdminSchedulingDateInputs() {
  const startMs = startOfLocalDay(Date.now());
  const endMs = startMs + ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS * 7 * 24 * 60 * 60 * 1000;
  return {
    startDate: toLocalDateInput(startMs),
    endDate: toLocalDateInput(endMs),
  };
}

export function adminSchedulingRangeFromDateInputs(startDate: string, endDate: string) {
  const start = parseLocalDateInput(startDate);
  const end = parseLocalDateInput(endDate);
  if (!start || !end) return null;
  return {
    rangeStart: startOfLocalDay(start),
    rangeEnd: endOfLocalDay(end),
  };
}

export function getDefaultAdminSchedulingRange() {
  const { startDate, endDate } = getDefaultAdminSchedulingDateInputs();
  const range = adminSchedulingRangeFromDateInputs(startDate, endDate);
  if (!range) {
    throw new Error("Invalid default admin scheduling range");
  }
  return range;
}

export function formatCrewResponseLabel(status: CrewAvailabilityResponseStatus): string {
  switch (status) {
    case "yes":
      return "Yes";
    case "partial":
      return "Partial";
    case "only_if_necessary":
      return "Backup";
    case "no":
      return "No";
  }
}

export function crewResponseBadgeClass(status: CrewAvailabilityResponseStatus): string {
  switch (status) {
    case "yes":
      return "bg-status-emerald-500/15 text-status-emerald-700 border-status-emerald-500/30";
    case "partial":
      return "bg-status-blue-500/15 text-status-blue-700 border-status-blue-500/30";
    case "only_if_necessary":
      return "bg-status-amber-500/15 text-status-amber-700 border-status-amber-500/30";
    case "no":
      return "bg-status-rose-500/15 text-status-rose-700 border-status-rose-500/30";
  }
}

export function formatEventDateTime(value: number) {
  return formatDateTime(value, "short");
}

type ResponderNotesSource = {
  notes?: string;
  responseStatus?: CrewAvailabilityResponseStatus;
  partialWindows?: Array<{
    scheduleBlockId?: string;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>;
};

/** Notes left on an availability response, optionally scoped to a schedule block. */
export function getAvailabilityNotesForDisplay(
  responder: ResponderNotesSource | undefined,
  options?: { scheduleBlockId?: string },
): string[] {
  if (!responder) return [];

  const lines: string[] = [];
  if (responder.notes?.trim()) {
    lines.push(responder.notes.trim());
  }

  const windows = responder.partialWindows ?? [];
  for (const window of windows) {
    if (options?.scheduleBlockId && window.scheduleBlockId && window.scheduleBlockId !== options.scheduleBlockId) {
      continue;
    }
    const windowNote = window.notes?.trim();
    if (!windowNote) continue;
    const prefix =
      responder.responseStatus === "partial"
        ? `Partial (${formatEventDateTime(window.startsAt)} – ${formatEventDateTime(window.endsAt)}): `
        : "";
    lines.push(`${prefix}${windowNote}`);
  }

  return lines;
}

/** Hydrate a datetime input from stored ms (always Pacific wall clock). */
export function toLocalDateTimeInput(value: number | Date) {
  const ms = value instanceof Date ? value.getTime() : value;
  return toPacificDateTimeInput(ms);
}

/** Persist a datetime input string as Pacific wall clock → ms. */
export function localDateTimeInputToMs(value: string) {
  return pacificDateTimeInputToMs(value);
}

export function requireLocalDateTimeInputMs(value: string, label = "date/time") {
  const ms = localDateTimeInputToMs(value);
  if (ms == null) throw new Error(`Invalid ${label}.`);
  return ms;
}

export type TimeWindow = { startsAt: number; endsAt: number };

export type SectionForAvailability = TimeWindow & { id?: string };

export type ResponderAvailability = {
  responseStatus: CrewAvailabilityResponseStatus;
  partialWindows?: Array<TimeWindow & { scheduleBlockId?: string; notes?: string }>;
  busyWindows?: Array<TimeWindow & { notes?: string }>;
};

/**
 * How well someone's answer covers one section, best first:
 * available → part (some of it) → backup → pending (no answer) → unavailable.
 */
export type SectionAvailabilityLevel = "available" | "part" | "backup" | "pending" | "unavailable";

export const SECTION_AVAILABILITY_RANK: Record<SectionAvailabilityLevel, number> = {
  available: 0,
  part: 1,
  backup: 2,
  pending: 3,
  unavailable: 4,
};

export function formatTimeWindow(window: TimeWindow) {
  return `${formatTime(window.startsAt)}–${formatTime(window.endsAt)}`;
}

function overlapMs(a: TimeWindow, b: TimeWindow) {
  return Math.max(0, Math.min(a.endsAt, b.endsAt) - Math.max(a.startsAt, b.startsAt));
}

function busyDetail(windows: Array<TimeWindow & { notes?: string }>) {
  return windows
    .map((window) => {
      const note = window.notes?.trim();
      return `Busy ${formatTimeWindow(window)}${note ? ` (${note})` : ""}`;
    })
    .join(", ");
}

export function sectionAvailability(
  responder: ResponderAvailability | undefined,
  section: SectionForAvailability,
): { level: SectionAvailabilityLevel; detail?: string } {
  if (!responder) return { level: "pending" };
  switch (responder.responseStatus) {
    case "no":
      return { level: "unavailable", detail: "Said no" };
    case "only_if_necessary":
      return { level: "backup", detail: "Only if needed" };
    case "yes":
      return { level: "available" };
    case "partial":
      break;
  }

  const sectionMs = section.endsAt - section.startsAt;
  const busy = (responder.busyWindows ?? []).filter((window) => overlapMs(window, section) > 0);
  if (busy.some((window) => overlapMs(window, section) >= sectionMs)) {
    return { level: "unavailable", detail: busyDetail(busy) };
  }

  const windows = responder.partialWindows ?? [];
  const picked =
    section.id !== undefined && windows.some((window) => window.scheduleBlockId === section.id);
  if (picked) {
    return busy.length > 0
      ? { level: "part", detail: busyDetail(busy) }
      : { level: "available" };
  }

  // Custom windows (older answers, or events without sections at answer time).
  const covered = windows
    .filter((window) => !window.scheduleBlockId)
    .reduce((sum, window) => sum + overlapMs(window, section), 0);
  if (covered <= 0) return { level: "unavailable", detail: "Not this section" };
  if (covered >= sectionMs && busy.length === 0) return { level: "available" };
  const free = windows
    .filter((window) => !window.scheduleBlockId && overlapMs(window, section) > 0)
    .map((window) => `Free ${formatTimeWindow(window)}`)
    .join(", ");
  return { level: "part", detail: [free, busyDetail(busy)].filter(Boolean).join(" · ") };
}

/**
 * Sections left after busy times: a section any busy window overlaps is
 * unchecked by default (crew can re-check it if they can still do part).
 */
export function sectionsClearOfBusy<T extends TimeWindow & { _id: string }>(
  sections: T[],
  busyWindows: TimeWindow[],
) {
  return sections
    .filter((section) => !busyWindows.some((window) => overlapMs(window, section) > 0))
    .map((section) => section._id);
}

/** The parts of `span` not covered by any busy window (for events with no sections yet). */
export function freeWindowsAround(span: TimeWindow, busyWindows: TimeWindow[]): TimeWindow[] {
  const sorted = [...busyWindows]
    .filter((window) => overlapMs(window, span) > 0)
    .sort((a, b) => a.startsAt - b.startsAt);
  const free: TimeWindow[] = [];
  let cursor = span.startsAt;
  for (const window of sorted) {
    if (window.startsAt > cursor) free.push({ startsAt: cursor, endsAt: window.startsAt });
    cursor = Math.max(cursor, window.endsAt);
  }
  if (cursor < span.endsAt) free.push({ startsAt: cursor, endsAt: span.endsAt });
  return free;
}

export function windowsOverlap(a: TimeWindow, b: TimeWindow) {
  return overlapMs(a, b) > 0;
}
