import {
  formatDateTime,
  pacificDateKey,
  pacificDateTimeInputToMs,
  pacificEndOfDayMs,
  pacificStartOfDayMs,
  toPacificDateTimeInput,
} from "@/lib/format";

export type CrewAvailabilityResponseStatus = "yes" | "partial" | "only_if_necessary" | "no";

export const DEFAULT_AVAILABILITY_WEEKS = 3;
export const EXTENDED_AVAILABILITY_WEEKS = 12;
export const ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS = 2;

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
      return "Only if necessary";
    case "no":
      return "No";
  }
}

export function crewResponseBadgeClass(status: CrewAvailabilityResponseStatus): string {
  switch (status) {
    case "yes":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "partial":
      return "bg-blue-500/15 text-blue-700 border-blue-500/30";
    case "only_if_necessary":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "no":
      return "bg-rose-500/15 text-rose-700 border-rose-500/30";
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
