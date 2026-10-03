"use client";

import { useQuery } from "convex/react";
import { ChartLineIcon, ClockIcon, UsersThreeIcon, WarningIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { CountBarChart } from "@/components/insights/count-bar-chart";
import { CrewHoursBandsCard } from "@/components/insights/crew-hours-bands-card";
import {
  formatDays,
  formatRate,
  InsightCard,
  InsightGrid,
  InsightLinkRow,
  plural,
  shortMonthLabel,
  StatRow,
  StatTile,
  TruncatedNotice,
} from "@/components/insights/insights-ui";
import { RowCell, RowFlag, RowList } from "@/components/list-page";

type InsightsCrewPanelProps = {
  startMs: number;
  endMs: number;
};

/** Staffing for crewed events starting in range: coverage, hours, and who carries them. */
export function InsightsCrewPanel({ startMs, endMs }: InsightsCrewPanelProps) {
  const rangeArgs = { startMs, endMs };
  const fill = useQuery(api.analyticsCrew.getCrewFillRate, rangeArgs);
  const hours = useQuery(api.analyticsCrew.getCrewHoursAndOt, rangeArgs);
  const latency = useQuery(api.analyticsCrew.getAvailabilityLatency, rangeArgs);
  const attention = useQuery(api.analyticsCrew.getCrewAttentionAging, rangeArgs);
  const profit = useQuery(api.analyticsProfit.getProfitability, rangeArgs);

  return (
    <div className="space-y-4" data-testid="insights-crew-panel">
      <TruncatedNotice
        show={fill?.truncated || hours?.truncated || latency?.truncated || attention?.truncated}
      />

      <StatRow>
        <StatTile
          label="Fill rate"
          loading={fill === undefined}
          value={formatRate(fill?.fillRate)}
          detail={fill ? `${fill.filledShifts} of ${plural(fill.totalShifts, "crew slot")} filled` : null}
        />
        <StatTile
          label="Crew hours"
          loading={hours === undefined}
          value={hours ? Math.round(hours.totalHours).toLocaleString("en-US") : "0"}
          detail={hours ? `Scheduled, across ${plural(hours.usersWithHours, "crew member")}` : null}
        />
        <StatTile
          label="Top five carry"
          loading={hours === undefined}
          value={formatRate(hours?.topFiveShare)}
          detail="Share of crew hours worked by the five busiest people"
          testId="insights-stat-top-five"
        />
        <StatTile
          label="Crew labor margin"
          loading={profit === undefined}
          value={formatRate(profit?.crewMarginRate)}
          detail={
            profit
              ? `Crew lines billed vs estimated crew cost on ${plural(profit.bookedEvents, "booked event")}`
              : null
          }
        />
      </StatRow>

      <CrewHoursBandsCard />

      <InsightGrid>
        <InsightCard
          icon={UsersThreeIcon}
          title="Busiest crew"
          description="Scheduled hours in range, most first. Open someone to see their timecard."
          loading={hours === undefined}
          testId="insights-busiest-crew"
        >
          {hours && hours.topCrew.length > 0 ? (
            <RowList joined>
              {hours.topCrew.map((row) => (
                <InsightLinkRow
                  key={row.userId}
                  href={`/dashboard/users/timecards/${row.userId}`}
                  title={row.name}
                  detail={`${plural(row.events, "event")} · ${plural(row.shifts, "shift")}`}
                  cells={<RowCell className="w-20 font-medium">{row.hours.toFixed(1)} h</RowCell>}
                />
              ))}
            </RowList>
          ) : (
            <p className="text-sm text-muted-foreground">No assigned crew hours in this range.</p>
          )}
        </InsightCard>

        <InsightCard
          icon={WarningIcon}
          title="Still needing crew"
          description="Crewed events in range without every slot filled."
          loading={attention === undefined}
        >
          {attention ? (
            <RowList joined>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Events with open or no slots</span>
                {attention.unconfirmedEvents > 0 ? <RowFlag>{plural(attention.unconfirmedEvents, "event")}</RowFlag> : null}
                <RowCell className="w-16 font-medium">{attention.unconfirmedEvents}</RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Already happened short-staffed</span>
                <RowCell className="w-16 font-medium">{attention.overdueUnconfirmed}</RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Median days until upcoming ones start</span>
                <RowCell className="w-24 font-medium">{formatDays(attention.medianDaysUntilStart)}</RowCell>
              </li>
            </RowList>
          ) : null}
        </InsightCard>

        <InsightCard icon={ChartLineIcon} title="Fill rate by month" loading={fill === undefined}>
          {fill ? (
            <CountBarChart
              data={fill.byMonth.map((row) => ({
                key: shortMonthLabel(row.monthKey),
                count: row.fillRate == null ? 0 : Math.round(row.fillRate * 100),
              }))}
              valueLabel="Fill %"
              emptyLabel="No crewed shifts in this range."
            />
          ) : null}
        </InsightCard>

        <InsightCard
          icon={ClockIcon}
          title="Hours by week"
          description="Assigned crew hours per ISO week."
          loading={hours === undefined}
        >
          {hours ? (
            <CountBarChart
              data={hours.byWeek.map((row) => ({
                key: row.weekKey.replace(/^\d{4}-/, ""),
                count: Math.round(row.hours),
              }))}
              valueLabel="Hours"
              emptyLabel="No assigned hours in this range."
            />
          ) : null}
        </InsightCard>

        <InsightCard
          icon={WarningIcon}
          title="Overtime risk"
          description="Crew scheduled over 8 hours in a day or 40 in a week (overtime), or over 12 in a day (double time)."
          loading={hours === undefined}
        >
          {hours ? (
            <RowList joined>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Overtime risk</span>
                <RowCell className="w-28 font-medium">{plural(hours.otRiskUsers, "person", "people")}</RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Double-time risk</span>
                <RowCell className="w-28 font-medium">{plural(hours.dtRiskUsers, "person", "people")}</RowCell>
              </li>
            </RowList>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={ClockIcon}
          title="Availability replies"
          description="Days from an event being created to crew answering whether they're available."
          loading={latency === undefined}
        >
          {latency ? (
            <RowList joined>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Median reply time</span>
                <RowCell className="w-24 font-medium">{formatDays(latency.medianDays)}</RowCell>
                <RowCell className="w-16" muted>
                  n={latency.sampleSize}
                </RowCell>
              </li>
            </RowList>
          ) : null}
        </InsightCard>
      </InsightGrid>
    </div>
  );
}
