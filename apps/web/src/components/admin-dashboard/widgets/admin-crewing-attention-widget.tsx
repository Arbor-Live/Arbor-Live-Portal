"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { UsersIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import {
  ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS,
  getDefaultAdminSchedulingRange,
} from "@/lib/crew-availability";
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
          <p className="text-sm text-muted-foreground">Every upcoming crewed event is fully staffed.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {rows.length} event{rows.length === 1 ? "" : "s"} need crew in the next {ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS} weeks.
            </p>
            {rows.slice(0, 5).map((event) => (
              <Link
                key={event._id}
                href={`/dashboard/events/${event._id}/schedule`}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(event.startAt)}
                  {event.venueName ? ` · ${event.venueName}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.totalShifts === 0
                    ? "No crew slots yet"
                    : [
                        event.unfilledShifts > 0 || event.backupShifts === 0
                          ? `${event.unfilledShifts} open slot${event.unfilledShifts === 1 ? "" : "s"}`
                          : null,
                        event.backupShifts > 0 ? `${event.backupShifts} on backup` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}{" "}
                  · waiting on {event.responseCounts.pending}
                </p>
              </Link>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
