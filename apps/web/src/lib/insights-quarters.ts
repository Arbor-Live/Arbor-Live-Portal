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
 * Stanford's academic calendar as Insights periods. A quarter runs from its
 * first day of classes to the day before the next quarter starts (the break
 * after it counts toward it), so quarters tile the year. Summer is skipped
 * where "the quarter" means a working quarter: Arbor is closed then.
 */

export type InsightsPeriod = {
  id: string;
  /** "Autumn 2026", "2026–27" */
  label: string;
  /** Pacific day keys, inclusive. */
  startDate: string;
  endDate: string;
};

export type InsightsQuarter = InsightsPeriod & { startMs: number; endMs: number };

function dayStartMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return pacificStartOfDayMs(year!, month!, day!);
}

function dayEndMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return pacificEndOfDayMs(year!, month!, day!);
}

function quarterPeriod(quarter: AcademicQuarter): InsightsPeriod {
  return { id: quarter.id, label: quarter.label, startDate: quarter.startDate, endDate: quarter.reportingEndDate };
}

/** The quarter today falls in (summer included: it is the current quarter). */
export function thisQuarterPeriod(todayKey: string): InsightsPeriod | null {
  const quarter = stanfordQuarterForDate(todayKey);
  return quarter ? quarterPeriod(quarter) : null;
}

/** The most recent working (non-summer) quarter before the current one. */
export function lastQuarterPeriod(todayKey: string): InsightsPeriod | null {
  const current = stanfordQuarterForDate(todayKey);
  if (!current) return null;
  const index = STANFORD_QUARTERS.findIndex((quarter) => quarter.id === current.id);
  const previous = STANFORD_QUARTERS.slice(0, index)
    .reverse()
    .find((quarter) => quarter.term !== "summer");
  return previous ? quarterPeriod(previous) : null;
}

/** The academic year today falls in (autumn to the day before next autumn), or the one before. */
export function academicYearPeriod(todayKey: string, offset: 0 | -1): InsightsPeriod | null {
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
