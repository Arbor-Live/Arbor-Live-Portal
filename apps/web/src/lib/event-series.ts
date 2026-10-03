import { addPacificWeeks, occurrenceStartAt } from "@arbor/format";
import { formatDateTime } from "@/lib/format";

export type RecurrenceEndMode = "count" | "date";

export function computeOccurrenceStarts(args: {
  anchorStartAt: number;
  intervalWeeks: number;
  occurrenceCount?: number;
  seriesEndAt?: number;
}): number[] {
  if (args.intervalWeeks < 1) {
    throw new Error("Interval must be at least 1 week.");
  }
  if (args.occurrenceCount !== undefined && args.occurrenceCount < 1) {
    throw new Error("Occurrence count must be at least 1.");
  }
  if (args.occurrenceCount === undefined && args.seriesEndAt === undefined) {
    throw new Error("Provide either occurrence count or series end date.");
  }
  if (args.occurrenceCount !== undefined && args.seriesEndAt !== undefined) {
    throw new Error("Provide either occurrence count or series end date, not both.");
  }

  const starts: number[] = [];

  if (args.occurrenceCount !== undefined) {
    for (let index = 0; index < args.occurrenceCount; index += 1) {
      starts.push(occurrenceStartAt(args.anchorStartAt, index, args.intervalWeeks));
    }
    return starts;
  }

  const endBound = args.seriesEndAt!;
  let current = args.anchorStartAt;
  while (current <= endBound) {
    starts.push(current);
    current = addPacificWeeks(current, args.intervalWeeks);
  }
  if (starts.length === 0) {
    throw new Error("No occurrences fall within the selected end date.");
  }
  return starts;
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
