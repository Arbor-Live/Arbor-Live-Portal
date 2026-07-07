"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarDotsIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function ScheduledEventsWidget() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.crewPortal.listMyScheduledEvents, { now, weeksAhead: 8 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDotsIcon className="size-4" />
          Upcoming shifts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming assigned shifts.</p>
        ) : (
          events.slice(0, 5).map((event) => (
            <Link
              key={event.eventId}
              href={`/dashboard/events/${event.eventId}`}
              className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(event.startAt)} · {event.shiftCount} shift
                {event.shiftCount === 1 ? "" : "s"}
                {event.venueName ? ` · ${event.venueName}` : ""}
              </p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
