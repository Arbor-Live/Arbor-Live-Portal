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
import { formatEventStatusLabel } from "@/lib/event-status";
import { formatUsd } from "@/lib/format";

type InsightsEventsPanelProps = {
  startMs: number;
  endMs: number;
};

function shortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  return `${labels[index] ?? month} ${year?.slice(2) ?? ""}`;
}

function statusChartData(rows: Array<{ key: string; count: number }>) {
  return rows.map((row) => ({
    key: formatEventStatusLabel(row.key as "tentative" | "logistics" | "scheduling" | "ready"),
    count: row.count,
  }));
}

export function InsightsEventsPanel({ startMs, endMs }: InsightsEventsPanelProps) {
  const upcoming = useQuery(api.analyticsEvents.getUpcomingEventsInsights, {});
  const volume = useQuery(api.analyticsDemand.getEventsVolume, { startMs, endMs });

  const anyTruncated = upcoming?.truncated || volume?.truncated;
  const d90 = upcoming?.horizons.d90;

  return (
    <div className="space-y-4" data-testid="insights-events-panel">
      {anyTruncated ? (
        <p className="text-xs text-muted-foreground">
          Some series are truncated by scan limits — narrow the range for fuller totals.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Next 7 days</CardTitle>
            <CardDescription>Upcoming non-cancelled starts</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{upcoming.horizons.d7.eventCount}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next 30 days</CardTitle>
            <CardDescription>Upcoming non-cancelled starts</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {upcoming.horizons.d30.eventCount}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next 90 days</CardTitle>
            <CardDescription>Upcoming non-cancelled starts</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {upcoming.horizons.d90.eventCount}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Booked ahead</CardTitle>
            <CardDescription>Approved quotes linked to next 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {formatUsd(upcoming.horizons.d90.bookedRevenueUsd)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming by status</CardTitle>
            <CardDescription>Pipeline mix in the next 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart
                data={statusChartData(upcoming.horizons.d90.byStatus)}
                emptyLabel="No upcoming events in the next 90 days."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming by type</CardTitle>
            <CardDescription>Event types in the next 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart
                data={upcoming.horizons.d90.byEventType}
                emptyLabel="No upcoming events in the next 90 days."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ops readiness</CardTitle>
            <CardDescription>Attention items among next 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined || d90 === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : d90.eventCount === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events in the next 90 days.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Unconfirmed crew</p>
                  <p className="text-lg font-semibold tabular-nums">{d90.unconfirmedCrewedCount}</p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Missing lead / manager</p>
                  <p className="text-lg font-semibold tabular-nums">{d90.missingLeadCount}</p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Missing schedule</p>
                  <p className="text-lg font-semibold tabular-nums">{d90.missingScheduleCount}</p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">No linked invoice</p>
                  <p className="text-lg font-semibold tabular-nums">{d90.missingInvoiceCount}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events in range</CardTitle>
            <CardDescription>Non-cancelled starts in the selected date range</CardDescription>
          </CardHeader>
          <CardContent>
            {volume === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="mb-3 text-2xl font-semibold tabular-nums">{volume.total}</p>
                <CountBarChart
                  data={volume.byMonth.map((row) => ({
                    key: shortMonthLabel(row.key),
                    count: row.count,
                  }))}
                  emptyLabel="No events started in this range."
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
