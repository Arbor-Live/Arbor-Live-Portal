"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PostEventWorkCard } from "@/components/events/post-event-work-card";

export function MyPostEventWorkClient() {
  const [now] = useState(() => Date.now());
  const rows = useQuery(api.crewPortal.listMyPostEventWork, { now });

  if (rows === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Post-event work</CardTitle>
        </CardHeader>
      </Card>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
          </CardContent>
        </Card>
      ) : (
        rows.map((row) => <PostEventWorkCard key={row.eventId} row={row} />)
      )}
    </div>
  );
}
