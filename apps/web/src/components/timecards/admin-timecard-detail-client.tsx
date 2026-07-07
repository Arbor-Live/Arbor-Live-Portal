"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TimecardPeriodList } from "@/components/timecards/timecard-period-list";

export function AdminTimecardDetailClient({ userId }: { userId: string }) {
  const [now] = useState(() => Date.now());
  const detail = useQuery(api.timecards.getTimecardsForUser, { userId, now });

  if (detail === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
          <p className="text-sm text-muted-foreground">{detail.email}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/users/timecards">Back to overview</Link>
        </Button>
      </div>

      <TimecardPeriodList periods={detail.periods} />
    </div>
  );
}
