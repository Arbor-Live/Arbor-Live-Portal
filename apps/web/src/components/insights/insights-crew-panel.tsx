"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountBarChart } from "@/components/insights/count-bar-chart";

type InsightsCrewPanelProps = {
  startMs: number;
  endMs: number;
};

function formatRate(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function formatDays(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} days`;
}

function shortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  return `${labels[index] ?? month} ${year?.slice(2) ?? ""}`;
}

export function InsightsCrewPanel({ startMs, endMs }: InsightsCrewPanelProps) {
  const rangeArgs = { startMs, endMs };
  const fill = useQuery(api.analyticsCrew.getCrewFillRate, rangeArgs);
  const hours = useQuery(api.analyticsCrew.getCrewHoursAndOt, rangeArgs);
  const latency = useQuery(api.analyticsCrew.getAvailabilityLatency, rangeArgs);
  const attention = useQuery(api.analyticsCrew.getCrewAttentionAging, rangeArgs);

  const anyTruncated =
    fill?.truncated || hours?.truncated || latency?.truncated || attention?.truncated;

  return (
    <div className="space-y-4">
      {anyTruncated ? (
        <p className="text-xs text-muted-foreground">
          Some series are truncated by scan limits — narrow the range for fuller totals.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Fill rate</CardTitle>
            <CardDescription>Filled / total shifts</CardDescription>
          </CardHeader>
          <CardContent>
            {fill === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">{formatRate(fill.fillRate)}</p>
                <p className="text-xs text-muted-foreground">
                  {fill.filledShifts}/{fill.totalShifts} shifts
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unconfirmed</CardTitle>
            <CardDescription>Crewed events incomplete</CardDescription>
          </CardHeader>
          <CardContent>
            {fill === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{fill.unconfirmedEvents}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Crew hours</CardTitle>
            <CardDescription>Assigned shifts in range</CardDescription>
          </CardHeader>
          <CardContent>
            {hours === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{hours.totalHours.toFixed(1)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Availability latency</CardTitle>
            <CardDescription>Event created → responded</CardDescription>
          </CardHeader>
          <CardContent>
            {latency === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatDays(latency.medianDays)}
                </p>
                <p className="text-xs text-muted-foreground">median · n={latency.sampleSize}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fill rate by month</CardTitle>
          </CardHeader>
          <CardContent>
            {fill === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart
                data={fill.byMonth.map((row) => ({
                  key: shortMonthLabel(row.monthKey),
                  count: row.fillRate == null ? 0 : Math.round(row.fillRate * 100),
                }))}
                valueLabel="Fill %"
                emptyLabel="No crewed shifts in this range."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hours by week</CardTitle>
            <CardDescription>ISO weeks · assigned crew</CardDescription>
          </CardHeader>
          <CardContent>
            {hours === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart
                data={hours.byWeek.map((row) => ({
                  key: row.weekKey.replace(/^\d{4}-/, ""),
                  count: Math.round(row.hours),
                }))}
                valueLabel="Hours"
                emptyLabel="No assigned hours in this range."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OT / DT risk</CardTitle>
            <CardDescription>Users over 8h/day, 12h/day, or 40h/week</CardDescription>
          </CardHeader>
          <CardContent>
            {hours === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Crew with hours</p>
                  <p className="text-lg font-semibold tabular-nums">{hours.usersWithHours}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">OT risk</p>
                  <p className="text-lg font-semibold tabular-nums">{hours.otRiskUsers}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">DT risk</p>
                  <p className="text-lg font-semibold tabular-nums">{hours.dtRiskUsers}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attention aging</CardTitle>
            <CardDescription>Unconfirmed crewed events vs start</CardDescription>
          </CardHeader>
          <CardContent>
            {attention === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Unconfirmed</p>
                  <p className="text-lg font-semibold tabular-nums">{attention.unconfirmedEvents}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Median days to start</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDays(attention.medianDaysUntilStart)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Already started</p>
                  <p className="text-lg font-semibold tabular-nums">{attention.overdueUnconfirmed}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
