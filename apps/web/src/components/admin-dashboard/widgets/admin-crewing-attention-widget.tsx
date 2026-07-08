"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { UsersIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getDefaultAdminSchedulingRange } from "@/lib/crew-availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function AdminCrewingAttentionWidget() {
  const [range] = useState(() => getDefaultAdminSchedulingRange());
  const rows = useQuery(api.eventCrewAvailability.listForAdminOverview, {
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    unconfirmedOnly: true,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-4" />
          Crewing attention
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/events/crew-scheduling">Scheduling</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">All upcoming crewed events are fully confirmed.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {rows.length} event{rows.length === 1 ? "" : "s"} need attention in the next two weeks.
            </p>
            {rows.slice(0, 5).map((event) => (
              <Link
                key={event._id}
                href={`/dashboard/events/${event._id}`}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(event.startAt)}
                  {event.venueName ? ` · ${event.venueName}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.unfilledShifts} open shift{event.unfilledShifts === 1 ? "" : "s"} ·{" "}
                  {event.responseCounts.pending} pending response
                  {event.responseCounts.pending === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
