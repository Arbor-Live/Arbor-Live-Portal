import { periodMsRange, thisQuarterPeriod } from "@/lib/academic-periods";
import { addDaysToDateKey } from "@/lib/format";

export type HoursWindow = { startMs: number; endMs: number };

export type CrewHoursWindows = {
  /** Monday through Sunday of the current week. */
  week: HoursWindow;
  /** The Stanford quarter today falls in; null outside the calendar's coverage. */
  quarter: (HoursWindow & { label: string }) | null;
};

/** Monday on or before a Pacific day key. */
function mondayOf(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return addDaysToDateKey(dateKey, -((weekday + 6) % 7));
}

/** This week and this quarter as ms ranges, for crew hours lookups. */
export function crewHoursWindows(todayKey: string): CrewHoursWindows {
  const monday = mondayOf(todayKey);
  const quarter = thisQuarterPeriod(todayKey);
  return {
    week: periodMsRange({ startDate: monday, endDate: addDaysToDateKey(monday, 6) }),
    quarter: quarter ? { ...periodMsRange(quarter), label: quarter.label } : null,
  };
}

export function formatHours(hours: number) {
  return `${Number(hours.toFixed(1))}h`;
}
