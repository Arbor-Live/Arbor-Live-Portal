"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ClipboardTextIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function PostEventWorkWidget() {
  const [now] = useState(() => Date.now());
  const rows = useQuery(api.crewPortal.listMyPostEventWork, { now });
  const pending = (rows ?? []).filter(
    (row) => !row.feedbackSubmitted || !row.mediaResolved,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardTextIcon className="size-4" />
          Post-event work
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/events/post-event">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events awaiting your review or photos.
          </p>
        ) : (
          pending.slice(0, 5).map((row) => (
            <div key={row.eventId} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">Ended {formatDateTime(row.endAt)}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
