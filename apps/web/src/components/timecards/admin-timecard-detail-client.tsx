"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EmptyState } from "@/components/list-page";
import { MetaItem, PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TimecardPeriodSummary } from "@/components/timecards/timecard-period-summary";
import { TimecardPeriodList } from "@/components/timecards/timecard-period-list";

export function AdminTimecardDetailClient({ userId }: { userId: string }) {
  const [now] = useState(() => Date.now());
  const detail = useQuery(api.timecards.getTimecardsForUser, { userId, now });

  if (detail === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4 pb-24" data-testid="timecard-detail-page">
      <PageHeader
        back={{ href: "/dashboard/timecards", label: "Crew timecards" }}
        title={detail.name}
        description="Hours from scheduled shifts over the last three pay periods. Hours to input are what goes into Stanford's payroll."
        meta={
          detail.email ? (
            <MetaItem icon={EnvelopeSimpleIcon}>
              <a href={`mailto:${detail.email}`} className="hover:underline">
                {detail.email}
              </a>
            </MetaItem>
          ) : null
        }
      />

      {detail.periods.length === 0 ? (
        <EmptyState>No shifts yet. Hours appear here after they&rsquo;re scheduled.</EmptyState>
      ) : (
        <>
          <TimecardPeriodSummary periods={detail.periods} />
          <TimecardPeriodList periods={detail.periods} />
        </>
      )}
    </div>
  );
}
