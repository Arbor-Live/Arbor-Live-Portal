"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarCheckIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function PendingAvailabilityWidget() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.crewPortal.listMyPendingAvailability, { now });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheckIcon className="size-4" />
          Availability
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/events/my-availability">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {events === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending availability requests.</p>
        ) : (
          events.slice(0, 5).map((event) => (
            <div key={event._id} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(event.startAt)} – {formatDateTime(event.endAt)}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
