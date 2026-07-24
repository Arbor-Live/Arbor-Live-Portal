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

export const SERIES_EDIT_SCOPE_LABELS: Record<SeriesEditScope, string> = {
  this: "This occurrence only",
  future: "This and all future occurrences",
  all: "Entire series",
};
