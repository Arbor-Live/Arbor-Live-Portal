"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Skeleton } from "@/components/ui/skeleton";
import { TimecardPeriodList } from "@/components/timecards/timecard-period-list";

export function TimecardsClient() {
  const [now] = useState(() => Date.now());
  const timecards = useQuery(api.timecards.getMyTimecards, { now });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timecards</h1>
        <p className="text-sm text-muted-foreground">
          Read-only summary from your scheduled shifts, grouped by pay period.
        </p>
      </div>

      {timecards === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <TimecardPeriodList periods={timecards} />
      )}
    </div>
  );
}
