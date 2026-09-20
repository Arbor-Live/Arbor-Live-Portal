"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { optimisticResolveMyEventMedia } from "@/lib/crew-portal-optimistic";

export function MyEventPhotosClient() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.crewPortal.listMyEventsNeedingPhotos, { now });
  const resolveMedia = useMutation(
    api.crewPortal.resolveMyEventMedia,
  ).withOptimisticUpdate(optimisticResolveMyEventMedia);

  if (events === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No events awaiting your photos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Photos</CardTitle>
        </CardHeader>
      </Card>
      {events.map((event) => (
        <Card key={event.eventId}>
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-base">{event.title}</CardTitle>
              <p className="text-xs text-muted-foreground">Ended {formatDateTime(event.endAt)}</p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="default" size="sm" asChild>
              <Link href={`/dashboard/events/${event.eventId}/media`}>Upload</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await resolveMedia({ eventId: event.eventId, status: "no_media" });
                  notify.success(`Marked "${event.title}" as no photos/videos.`);
                } catch (error) {
                  notify.error(getConvexErrorMessage(error));
                }
              }}
            >
              No photos/videos
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
