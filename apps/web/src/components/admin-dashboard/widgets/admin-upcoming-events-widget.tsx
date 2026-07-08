"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarDotsIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function AdminUpcomingEventsWidget() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.dashboardHome.listUpcomingAdminEvents, {
    now,
    limit: 5,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDotsIcon className="size-4" />
          Upcoming events
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/events">All events</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {events === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events are scheduled.</p>
        ) : (
          events.map((event) => (
            <Link
              key={event._id}
              href={`/dashboard/events/${event._id}`}
              className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{event.title}</p>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {event.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(event.startAt)}{event.venueName ? ` · ${event.venueName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {event.assignedCrewCount} crew assigned
                {event.unfilledShifts > 0 ? ` · ${event.unfilledShifts} open shift${event.unfilledShifts === 1 ? "" : "s"}` : ""}
                {event.invoiceLinked ? " · quote linked" : ""}
              </p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
