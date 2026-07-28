"use client";

import { useMemo, useState } from "react";
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
import { InsightsRangePicker } from "@/components/insights/insights-range-picker";
import { RevenueBarChart } from "@/components/insights/revenue-bar-chart";
import { RevenueMixChart } from "@/components/insights/revenue-mix-chart";
import { TopClientsTable } from "@/components/insights/top-clients-table";
import { formatUsd } from "@/lib/format";
import { getDefaultInsightsDateInputs, insightsRangeFromDateInputs } from "@/lib/insights-range";

function formatDays(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} days`;
}

export function InsightsFinancesPanel() {
  const defaults = useMemo(() => getDefaultInsightsDateInputs(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  const range = useMemo(
    () => insightsRangeFromDateInputs(startDate, endDate),
    [startDate, endDate],
  );

  const rangeArgs = range ? { startMs: range.startMs, endMs: range.endMs } : "skip";

  const summary = useQuery(api.analytics.getFinancialSummary, rangeArgs);
  const revenueByMonth = useQuery(api.analytics.getRevenueByMonth, rangeArgs);
  const revenueMix = useQuery(api.analytics.getRevenueMix, rangeArgs);
  const arSnapshot = useQuery(api.analytics.getArSnapshot, {});
  const quoteCycle = useQuery(api.analytics.getQuoteCashCycle, rangeArgs);
  const topClients = useQuery(api.analytics.getTopClients, range ? { ...range, limit: 10 } : "skip");

  const anyTruncated =
    summary?.truncated ||
    revenueByMonth?.truncated ||
    revenueMix?.truncated ||
    arSnapshot?.truncated ||
    quoteCycle?.truncated ||
    topClients?.truncated;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
          <CardDescription>
            Financial trends in Pacific Time. AR snapshot matches the current Payments queues
            (events in the last 90 days).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InsightsRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          {!range ? (
            <p className="text-sm text-destructive">Choose a valid From / To range.</p>
          ) : null}
          {anyTruncated ? (
            <p className="text-xs text-muted-foreground">
              Some series are truncated by scan limits — narrow the range for fuller totals.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
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
