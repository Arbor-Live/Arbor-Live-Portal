"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ChartLineIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";

function formatRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function AdminThisMonthWidget() {
  const strip = useQuery(api.analyticsDemand.getThisMonthStrip, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ChartLineIcon className="size-4" />
          This month
        </CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/financial-hub/insights">Insights</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {strip === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Events" value={String(strip.eventsCount)} />
            <Stat label="Conversion" value={formatRate(strip.conversionRate)} />
            <Stat label="Open AR" value={formatUsd(strip.openArUsd)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
