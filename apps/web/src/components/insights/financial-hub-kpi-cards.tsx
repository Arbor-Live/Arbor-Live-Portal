"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/insights/sparkline";
import { formatUsd } from "@/lib/format";
import { getDefaultInsightsDateInputs, insightsRangeFromDateInputs } from "@/lib/insights-range";

function useDefaultInsightsRange() {
  const defaults = getDefaultInsightsDateInputs();
  return insightsRangeFromDateInputs(defaults.startDate, defaults.endDate);
}

export function FinancialHubRevenueCard() {
  const range = useDefaultInsightsRange();
  const summary = useQuery(
    api.analytics.getFinancialSummary,
    range ? { startMs: range.startMs, endMs: range.endMs } : "skip",
  );

  if (summary === undefined) {
    return <p className="text-sm text-muted-foreground">Loading revenue…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {formatUsd(summary.revenueRecognizedUsd)}
      </p>
      <p className="text-sm text-muted-foreground">
        Recognized (paid) · Booked {formatUsd(summary.revenueBookedUsd)}
      </p>
      <Sparkline
        data={summary.sparkline.map((point) => ({
          monthKey: point.monthKey,
          value: point.revenueUsd,
        }))}
      />
      {summary.truncated ? (
        <p className="text-xs text-muted-foreground">Partial data (scan limit reached).</p>
      ) : null}
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/financial-hub/insights">Open Insights</Link>
      </Button>
    </div>
  );
}

export function FinancialHubExpensesCard() {
  const range = useDefaultInsightsRange();
  const summary = useQuery(
    api.analytics.getFinancialSummary,
    range ? { startMs: range.startMs, endMs: range.endMs } : "skip",
  );

  if (summary === undefined) {
    return <p className="text-sm text-muted-foreground">Loading expenses…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {formatUsd(summary.expensesUsd)}
      </p>
      <p className="text-sm text-muted-foreground">
        Recorded event costs + band payouts (not full P&L)
      </p>
      <Sparkline
        data={summary.sparkline.map((point) => ({
          monthKey: point.monthKey,
          value: point.expensesUsd,
        }))}
        color="var(--muted-foreground)"
      />
      {summary.truncated ? (
        <p className="text-xs text-muted-foreground">Partial data (scan limit reached).</p>
      ) : null}
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/financial-hub/insights">Open Insights</Link>
      </Button>
    </div>
  );
}
