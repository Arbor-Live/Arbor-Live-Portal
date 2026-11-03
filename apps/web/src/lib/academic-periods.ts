import {
  pacificDateKey,
  pacificEndOfDayMs,
  pacificStartOfDayMs,
  STANFORD_QUARTERS,
  stanfordAcademicYearForDate,
  stanfordAcademicYearOffset,
  stanfordQuarterForDate,
  type AcademicQuarter,
} from "@/lib/format";

/*
 * Stanford's academic calendar as date-range periods for the dashboard
 * (Insights, lists with date filters, the events calendar). A quarter runs from its
 * first day of classes to the day before the next quarter starts (the break
 * after it counts toward it), so quarters tile the year. Summer is skipped
 * where "the quarter" means a working quarter: Arbor is closed then.
 */

export type AcademicPeriod = {
  id: string;
  /** "Autumn 2026", "2026–27" */
  label: string;
  /** Pacific day keys, inclusive. */
  startDate: string;
  endDate: string;
};

export type InsightsQuarter = AcademicPeriod & { startMs: number; endMs: number };

function dayStartMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return pacificStartOfDayMs(year!, month!, day!);
}

function dayEndMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return pacificEndOfDayMs(year!, month!, day!);
}

function quarterPeriod(quarter: AcademicQuarter): AcademicPeriod {
  return { id: quarter.id, label: quarter.label, startDate: quarter.startDate, endDate: quarter.reportingEndDate };
}

/** The quarter today falls in (summer included: it is the current quarter). */
export function thisQuarterPeriod(todayKey: string): AcademicPeriod | null {
  const quarter = stanfordQuarterForDate(todayKey);
  return quarter ? quarterPeriod(quarter) : null;
}

/** The most recent working (non-summer) quarter before the current one. */
export function lastQuarterPeriod(todayKey: string): AcademicPeriod | null {
  const current = stanfordQuarterForDate(todayKey);
  if (!current) return null;
  const index = STANFORD_QUARTERS.findIndex((quarter) => quarter.id === current.id);
  const previous = STANFORD_QUARTERS.slice(0, index)
    .reverse()
    .find((quarter) => quarter.term !== "summer");
  return previous ? quarterPeriod(previous) : null;
}

/** The next working (non-summer) quarter after the current one. */
export function nextQuarterPeriod(todayKey: string): AcademicPeriod | null {
  const current = stanfordQuarterForDate(todayKey);
  const index = current ? STANFORD_QUARTERS.findIndex((quarter) => quarter.id === current.id) : -1;
  const next = STANFORD_QUARTERS.slice(index + 1).find(
    (quarter) => quarter.term !== "summer" && quarter.startDate > todayKey,
  );
  return next ? quarterPeriod(next) : null;
}

/** The academic year today falls in (autumn to the day before next autumn), or the one before. */
export function academicYearPeriod(todayKey: string, offset: 0 | -1): AcademicPeriod | null {
  const current = stanfordAcademicYearForDate(todayKey);
  const year = current && offset !== 0 ? stanfordAcademicYearOffset(current, offset) : current;
  return year ? { id: year.id, label: year.label, startDate: year.startDate, endDate: year.endDate } : null;
}

/**
 * Working quarters that have started, newest first: the current one (unless
 * it's summer) and the ones before it.
 */
export function recentQuarters(nowMs: number = Date.now(), count = 4): InsightsQuarter[] {
  const todayKey = pacificDateKey(nowMs);
  return STANFORD_QUARTERS.filter((quarter) => quarter.term !== "summer" && quarter.startDate <= todayKey)
    .slice(-count)
    .reverse()
    .map((quarter) => ({
      ...quarterPeriod(quarter),
      startMs: dayStartMs(quarter.startDate),
      endMs: dayEndMs(quarter.reportingEndDate),
    }));
}

export type AcademicPeriodPreset = "this-quarter" | "last-quarter" | "next-quarter" | "this-year" | "last-year";

export const ACADEMIC_PERIOD_LABELS: Record<AcademicPeriodPreset, string> = {
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  "next-quarter": "Next quarter",
  "this-year": "This academic year",
  "last-year": "Last academic year",
};

/** A Stanford period by preset, or null outside the calendar's coverage. */
export function academicPeriod(preset: AcademicPeriodPreset, todayKey: string): AcademicPeriod | null {
  switch (preset) {
    case "this-quarter":
      return thisQuarterPeriod(todayKey);
    case "last-quarter":
      return lastQuarterPeriod(todayKey);
    case "next-quarter":
      return nextQuarterPeriod(todayKey);
    case "this-year":
      return academicYearPeriod(todayKey, 0);
    case "last-year":
      return academicYearPeriod(todayKey, -1);
  }
}

/** `{ startMs, endMs }` for a period's inclusive Pacific days. */
export function periodMsRange(period: Pick<AcademicPeriod, "startDate" | "endDate">) {
  return { startMs: dayStartMs(period.startDate), endMs: dayEndMs(period.endDate) };
}
