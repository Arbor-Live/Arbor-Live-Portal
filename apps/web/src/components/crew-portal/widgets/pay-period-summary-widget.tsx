"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ClockIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

export function PayPeriodSummaryWidget() {
  const [now] = useState(() => Date.now());
  const periods = useQuery(api.crewPortal.getMyPayPeriodSummary, { now });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClockIcon className="size-4" />
          Pay periods
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/timecards/mine">Timecards</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {periods === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          periods.map((period) => (
            <div key={period.label} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{period.label}</p>
                <p className="text-xs text-muted-foreground">Due {formatDate(period.dueMs)}</p>
              </div>
              <p className="text-sm font-medium">{period.daysWorked} days</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
