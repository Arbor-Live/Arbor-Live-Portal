import {
  academicCalendarSkipFilter,
  academicDayNote,
  addDaysToDateKey,
  computeOccurrenceSlots,
  occurrenceStartAt,
  pacificDateKey,
  stanfordQuarterInSession,
  type AcademicDayNote,
  type AcademicSkipMode,
  type OccurrenceSlot,
} from "@arbor/format";
import { formatDateTime } from "@/lib/format";

export type RecurrenceEndMode = "count" | "date";

export const ACADEMIC_SKIP_OPTIONS: Array<{ value: AcademicSkipMode | "none"; label: string }> = [
  { value: "breaks", label: "Skip closures, breaks & holidays" },
  { value: "breaks_and_finals", label: "Also skip finals" },
  { value: "none", label: "Don't skip (flag only)" },
];

export type OccurrencePreviewRow = OccurrenceSlot & {
  note: AcademicDayNote | null;
  skipped: boolean;
};

/**
 * Preview rows for a new series: kept occurrences plus the weeks skipped
 * between them, each tagged with its academic-calendar note.
 */
export function buildOccurrencePreview(args: {
  anchorStartAt: number;
  intervalWeeks: number;
  occurrenceCount?: number;
  seriesEndAt?: number;
  academicSkipMode?: AcademicSkipMode;
}): OccurrencePreviewRow[] {
  const kept = computeOccurrenceSlots({
    ...args,
    skip: academicCalendarSkipFilter(args.academicSkipMode),
  });
  const keptIndexes = new Set(kept.map((slot) => slot.occurrenceIndex));
  const lastIndex = kept[kept.length - 1]!.occurrenceIndex;
  const rows: OccurrencePreviewRow[] = [];
  for (let occurrenceIndex = 0; occurrenceIndex <= lastIndex; occurrenceIndex += 1) {
    const startAt = occurrenceStartAt(args.anchorStartAt, occurrenceIndex, args.intervalWeeks);
    rows.push({
      occurrenceIndex,
      startAt,
      note: academicDayNote(pacificDateKey(startAt)),
      skipped: !keptIndexes.has(occurrenceIndex),
    });
  }
  return rows;
}

/** Last day of classes of the quarter in session on `dateKey`, for "end with the quarter". */
export function quarterClassesEndFor(dateKey: string) {
  const quarter = stanfordQuarterInSession(dateKey);
  if (!quarter) return null;
  return { quarter, lastClassDate: addDaysToDateKey(quarter.finalsStartDate, -1) };
}

export function formatOccurrencePreview(value: number) {
  return formatDateTime(value, "short");
}

export type SeriesEditScope = "this" | "future" | "all";

/**
 * An event group (`eventSeries`): a recurring series, or a multi-day booking
 * (days that share one invoice). Both apply edits with the same three scopes.
 */
export type EventGroupKind = "recurring" | "multi_day";

export function eventGroupKind(group: { kind?: EventGroupKind } | null | undefined): EventGroupKind {
  return group?.kind ?? "recurring";
}

export const SERIES_EDIT_SCOPE_LABELS: Record<SeriesEditScope, string> = {
  this: "This occurrence only",
  future: "This and all future occurrences",
  all: "Entire series",
};

const MULTI_DAY_SCOPE_LABELS: Record<SeriesEditScope, string> = {
  this: "This day only",
  future: "This day and later days",
  all: "All days",
};

export function groupScopeLabels(kind: EventGroupKind): Record<SeriesEditScope, string> {
  return kind === "multi_day" ? MULTI_DAY_SCOPE_LABELS : SERIES_EDIT_SCOPE_LABELS;
}

/** What one member is called: "occurrence" on a series, "day" on a booking. */
export function groupDayNoun(kind: EventGroupKind, plural = false) {
  if (kind === "multi_day") return plural ? "days" : "day";
  return plural ? "occurrences" : "occurrence";
}

/** "Day 2" on a booking, "#2" on a series (from the 0-based index). */
export function groupDayLabel(kind: EventGroupKind, occurrenceIndex: number | undefined) {
  const number = (occurrenceIndex ?? 0) + 1;
  return kind === "multi_day" ? `Day ${number}` : `#${number}`;
}

/** The group's name for its kind: "Recurring series" or "Multi-day booking". */
export const EVENT_GROUP_KIND_LABELS: Record<EventGroupKind, string> = {
  recurring: "Recurring series",
  multi_day: "Multi-day booking",
};
