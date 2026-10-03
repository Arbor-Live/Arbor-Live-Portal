"use client";

import { ListSummary } from "@/components/list-page";
import { periodTotals, type TimecardPeriod } from "@/components/timecards/timecard-period-list";

/** "3 pay periods · 9 days worked · 41.50 h to input", over the listed periods. */
export function TimecardPeriodSummary({ periods }: { periods: TimecardPeriod[] }) {
  const daysWorked = periods.reduce((sum, period) => sum + period.daysWorked, 0);
  const toInput = periods.reduce((sum, period) => sum + periodTotals(period).input, 0);
  return (
    <ListSummary testId="timecard-periods-summary" order="Newest pay period first, shifts by day.">
      {periods.length} pay period{periods.length === 1 ? "" : "s"} · {daysWorked} day
      {daysWorked === 1 ? "" : "s"} worked · {toInput.toFixed(2)} h to input
    </ListSummary>
  );
}
