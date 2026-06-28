export type CrewAvailabilityResponseStatus = "yes" | "partial" | "only_if_necessary" | "no";

export const DEFAULT_AVAILABILITY_WEEKS = 3;
export const EXTENDED_AVAILABILITY_WEEKS = 12;
export const ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS = 2;

export function toLocalDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function endOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.getTime();
}

export function parseLocalDateInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDefaultAdminSchedulingDateInputs() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS * 7);
  return {
    startDate: toLocalDateInput(start),
    endDate: toLocalDateInput(end),
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
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

export function toLocalDateTimeInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function localDateTimeInputToMs(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}
