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
import { RevenueBarChart } from "@/components/insights/revenue-bar-chart";
import { formatUsd } from "@/lib/format";

type InsightsOpsPanelProps = {
  startMs: number;
  endMs: number;
};

function formatDays(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} days`;
}

function formatRate(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function queueLabel(status: string) {
  switch (status) {
    case "pending_payee":
      return "Needs payee";
    case "pending_email":
      return "Needs email";
    case "awaiting_confirmation":
      return "Awaiting reply";
    case "confirmed":
      return "Ready to pay";
    default:
      return status;
  }
}

export function InsightsOpsPanel({ startMs, endMs }: InsightsOpsPanelProps) {
  const rangeArgs = { startMs, endMs };
  const spend = useQuery(api.analyticsOps.getBandPayoutSpend, rangeArgs);
  const queueAging = useQuery(api.analyticsOps.getBandPayoutQueueAging, {});
  const turnaround = useQuery(api.analyticsOps.getBandPayoutTurnaround, rangeArgs);
  const damage = useQuery(api.analyticsOps.getDamageInsights, rangeArgs);
  const rentals = useQuery(api.analyticsOps.getRentalFulfillmentInsights, rangeArgs);

  const anyTruncated =
    spend?.truncated ||
    queueAging?.truncated ||
    turnaround?.truncated ||
    damage?.truncated ||
    rentals?.truncated;

  return (
    <div className="space-y-4" data-testid="insights-ops-panel">
      {anyTruncated ? (
        <p className="text-xs text-muted-foreground">
          Some series are truncated by scan limits — narrow the range for fuller totals.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Band payouts</CardTitle>
            <CardDescription>Paid in range</CardDescription>
          </CardHeader>
          <CardContent>
            {spend === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">{formatUsd(spend.totalUsd)}</p>
                <p className="text-xs text-muted-foreground">{spend.paymentCount} payments</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open damage</CardTitle>
            <CardDescription>Open + in progress</CardDescription>
          </CardHeader>
          <CardContent>
            {damage === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {damage.openCount + damage.inProgressCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  Median age {formatDays(damage.openAgingDays.medianDays)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rental returns</CardTitle>
            <CardDescription>Missing / damaged rates</CardDescription>
          </CardHeader>
          <CardContent>
            {rentals === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatRate(rentals.missingRate)} missing
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRate(rentals.damagedRate)} damaged · {rentals.returnUnits} units
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payout spend by month</CardTitle>
          </CardHeader>
          <CardContent>
            {spend === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <RevenueBarChart
                months={spend.byMonth}
                emptyLabel="No band payouts paid in this range."
                valueLabel="Payouts"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payout queue aging</CardTitle>
            <CardDescription>Point-in-time pending queues</CardDescription>
          </CardHeader>
          <CardContent>
            {queueAging === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-3">
                <CountBarChart
                  data={queueAging.queues.map((row) => ({
                    key: queueLabel(row.status),
                    count: row.count,
                  }))}
                />
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {queueAging.queues.map((row) => (
                    <p key={row.status}>
                      {queueLabel(row.status)}: median age {formatDays(row.medianAgeDays)} ·{" "}
                      {formatUsd(row.totalUsd)}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Confirmation → paid</CardTitle>
            <CardDescription>Turnaround on paid payouts in range</CardDescription>
          </CardHeader>
          <CardContent>
            {turnaround === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Email → confirmed</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDays(turnaround.emailToConfirmed.medianDays)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg {formatDays(turnaround.emailToConfirmed.avgDays)} · n=
                    {turnaround.emailToConfirmed.sampleSize}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Confirmed → paid</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDays(turnaround.confirmedToPaid.medianDays)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg {formatDays(turnaround.confirmedToPaid.avgDays)} · n=
                    {turnaround.confirmedToPaid.sampleSize}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Damage severity</CardTitle>
            <CardDescription>Reports opened in range</CardDescription>
          </CardHeader>
          <CardContent>
            {damage === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <CountBarChart
                  data={damage.severityMix}
                  emptyLabel="No damage reports opened in this range."
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Resolve median {formatDays(damage.resolutionDays.medianDays)} · resolved{" "}
                  {damage.resolvedInRange}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fulfillment duration</CardTitle>
            <CardDescription>startedAt → completedAt</CardDescription>
          </CardHeader>
          <CardContent>
            {rentals === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-lg font-semibold tabular-nums">{rentals.completedCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">In progress</p>
                  <p className="text-lg font-semibold tabular-nums">{rentals.inProgressCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Median duration</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDays(rentals.durationDays.medianDays)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
