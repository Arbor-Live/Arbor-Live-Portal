"use client";

import { RowCell, RowGroup, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill, type Tone } from "@/components/page-header";
import { formatDate, formatHours } from "@/lib/format";

type PeriodStatus = "open" | "due" | "past_due";

export type TimecardPeriod = {
  label: string;
  dueMs: number;
  daysWorked: number;
  status: PeriodStatus;
  days: Array<{
    dateMs: number;
    events: Array<{
      eventId: string;
      title: string;
      actualHours: number;
      inputHours: number;
    }>;
    totalActual: number;
    totalInput: number;
  }>;
};

export const PERIOD_STATUS: Record<PeriodStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "emerald" },
  due: { label: "Due", tone: "amber" },
  past_due: { label: "Past due", tone: "rose" },
};

export function periodTotals(period: TimecardPeriod) {
  return period.days.reduce(
    (sum, day) => ({ input: sum.input + day.totalInput, actual: sum.actual + day.totalActual }),
    { input: 0, actual: 0 },
  );
}

/**
 * Pay periods, newest first, each a group of shift rows (one per event per
 * day). Shared by My timecards and the admin's view of one crew member.
 */
export function TimecardPeriodList({ periods }: { periods: TimecardPeriod[] }) {
  return (
    <div className="space-y-4" data-testid="timecard-periods">
      {periods.map((period) => {
        const totals = periodTotals(period);
        const status = PERIOD_STATUS[period.status];
        return (
          <RowGroup
            key={period.label}
            testId="timecard-period"
            className="border"
            title={
              <>
                {period.label}
                {period.daysWorked > 0 ? (
                  <StatusPill tone={status.tone} className="h-5">
                    {status.label}
                  </StatusPill>
                ) : null}
              </>
            }
            description={`Due ${formatDate(period.dueMs)} · ${period.daysWorked} day${period.daysWorked === 1 ? "" : "s"} worked`}
            aside={
              period.daysWorked > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground">{formatHours(totals.input)}</span> to input ·{" "}
                  {formatHours(totals.actual)} worked
                </span>
              ) : null
            }
          >
            {period.days.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">No shifts in this pay period.</li>
            ) : (
              period.days.flatMap((day) =>
                day.events.map((event) => (
                  <ListRow
                    key={`${day.dateMs}-${event.eventId}`}
                    data-testid="timecard-shift-row"
                    href={`/dashboard/events/${event.eventId}`}
                  >
                    <RowText eyebrow={formatDate(day.dateMs)} title={event.title} />
                    <RowCell className="w-28">{formatHours(event.inputHours)} to input</RowCell>
                    <RowCell className="w-28" hideBelow="sm" muted>
                      {formatHours(event.actualHours)} worked
                    </RowCell>
                  </ListRow>
                )),
              )
            )}
          </RowGroup>
        );
      })}
    </div>
  );
}
