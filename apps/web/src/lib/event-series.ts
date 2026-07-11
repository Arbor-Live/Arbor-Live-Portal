import { formatDateTime } from "@/lib/format";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

  const intervalMs = args.intervalWeeks * WEEK_MS;
  const starts: number[] = [];
  let current = args.anchorStartAt;

  if (args.occurrenceCount !== undefined) {
    for (let index = 0; index < args.occurrenceCount; index += 1) {
      starts.push(current);
      current += intervalMs;
    }
    return starts;
  }

  const endBound = args.seriesEndAt!;
  while (current <= endBound) {
    starts.push(current);
    current += intervalMs;
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

export const SERIES_EDIT_SCOPE_LABELS: Record<SeriesEditScope, string> = {
  this: "This occurrence only",
  future: "This and all future occurrences",
  all: "Entire series",
};
