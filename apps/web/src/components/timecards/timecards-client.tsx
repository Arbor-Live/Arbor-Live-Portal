"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { EmptyState } from "@/components/list-page";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TimecardPeriodSummary } from "@/components/timecards/timecard-period-summary";
import { TimecardPeriodList } from "@/components/timecards/timecard-period-list";

export function TimecardsClient() {
  const [now] = useState(() => Date.now());
  const timecards = useQuery(api.timecards.getMyTimecards, { now });

  return (
    <div className="space-y-4 pb-24" data-testid="my-timecards-page">
      <PageHeader
        title="My timecards"
        description="Your hours from scheduled shifts, by pay period. Hours to input are a guide for Stanford: log real work, including prep, without exact clock times."
      />

      {timecards === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : timecards.length === 0 ? (
        <EmptyState>No shifts yet. Hours appear here after you&rsquo;re scheduled.</EmptyState>
      ) : (
        <>
          <TimecardPeriodSummary periods={timecards} />
          <TimecardPeriodList periods={timecards} />
        </>
      )}
    </div>
  );
}
