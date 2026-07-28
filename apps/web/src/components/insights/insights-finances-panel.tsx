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
import { ArAgingChart } from "@/components/insights/ar-aging-chart";
import { RevenueBarChart } from "@/components/insights/revenue-bar-chart";
import { RevenueMixChart } from "@/components/insights/revenue-mix-chart";
import { TopClientsTable } from "@/components/insights/top-clients-table";
import { formatUsd } from "@/lib/format";

type InsightsFinancesPanelProps = {
  startMs: number;
  endMs: number;
};

function formatDays(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} days`;
}

export function InsightsFinancesPanel({ startMs, endMs }: InsightsFinancesPanelProps) {
  const rangeArgs = { startMs, endMs };

  const summary = useQuery(api.analytics.getFinancialSummary, rangeArgs);
  const revenueByMonth = useQuery(api.analytics.getRevenueByMonth, rangeArgs);
  const revenueMix = useQuery(api.analytics.getRevenueMix, rangeArgs);
  const arSnapshot = useQuery(api.analytics.getArSnapshot, {});
  const quoteCycle = useQuery(api.analytics.getQuoteCashCycle, rangeArgs);
  const topClients = useQuery(api.analytics.getTopClients, { startMs, endMs, limit: 10 });
  const upcoming = useQuery(api.analyticsEvents.getUpcomingEventsInsights, {});

  const anyTruncated =
    summary?.truncated ||
    revenueByMonth?.truncated ||
    revenueMix?.truncated ||
    arSnapshot?.truncated ||
    quoteCycle?.truncated ||
    topClients?.truncated ||
    upcoming?.truncated;

  return (
    <div className="space-y-4">
      {anyTruncated ? (
        <p className="text-xs text-muted-foreground">
          Some series are truncated by scan limits — narrow the range for fuller totals.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Recognized revenue</CardTitle>
            <CardDescription>Paid invoices in range</CardDescription>
          </CardHeader>
          <CardContent>
            {summary === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {formatUsd(summary.revenueRecognizedUsd)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Booked</CardTitle>
            <CardDescription>Approved / finalized in range</CardDescription>
          </CardHeader>
          <CardContent>
            {summary === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {formatUsd(summary.revenueBookedUsd)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Booked ahead (90d)</CardTitle>
            <CardDescription>See Events tab for upcoming calendar detail</CardDescription>
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
        <Card>
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>Event costs + band payouts</CardDescription>
          </CardHeader>
          <CardContent>
            {summary === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatUsd(summary.expensesUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Events {formatUsd(summary.eventCostsUsd)} · Payouts{" "}
                  {formatUsd(summary.bandPayoutsUsd)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by month</CardTitle>
            <CardDescription>Recognized (payment received)</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueByMonth === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <RevenueBarChart months={revenueByMonth.months} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue mix</CardTitle>
            <CardDescription>Subtotals on paid invoices</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueMix === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <RevenueMixChart {...revenueMix} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AR snapshot</CardTitle>
            <CardDescription>Open payment queues (point-in-time)</CardDescription>
          </CardHeader>
          <CardContent>
            {arSnapshot === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ArAgingChart
                paymentPending={arSnapshot.paymentPending}
                proofNoReceipt={arSnapshot.proofNoReceipt}
                overdue={arSnapshot.overdue}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quote → cash cycle</CardTitle>
            <CardDescription>Median / average days</CardDescription>
          </CardHeader>
          <CardContent>
            {quoteCycle === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Review ready → approved</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDays(quoteCycle.reviewToApprove.medianDays)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg {formatDays(quoteCycle.reviewToApprove.avgDays)} · n=
                    {quoteCycle.reviewToApprove.sampleSize}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Approved → paid</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDays(quoteCycle.approveToPaid.medianDays)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg {formatDays(quoteCycle.approveToPaid.avgDays)} · n=
                    {quoteCycle.approveToPaid.sampleSize}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top clients</CardTitle>
          <CardDescription>Host organizations by paid total</CardDescription>
        </CardHeader>
        <CardContent>
          {topClients === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <TopClientsTable clients={topClients.clients} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
