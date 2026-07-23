"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CameraIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { optimisticResolveMyEventMedia } from "@/lib/crew-portal-optimistic";

export function EventsNeedingPhotosWidget() {
  const [now] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const events = useQuery(api.crewPortal.listMyEventsNeedingPhotos, { now });
  const resolveMedia = useMutation(
    api.crewPortal.resolveMyEventMedia,
  ).withOptimisticUpdate(optimisticResolveMyEventMedia);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CameraIcon className="size-4" />
          Event photos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Uploads are required after crewed events. Leadership may follow up if media is missing.
        </p>
        {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
        {events === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events awaiting your photos.</p>
        ) : (
          events.slice(0, 5).map((event) => (
            <div key={event.eventId} className="rounded-md border px-3 py-2 text-sm space-y-2">
              <div>
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">Ended {formatDateTime(event.endAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="default" size="sm" asChild>
                  <Link href={`/dashboard/events/${event.eventId}/media`}>Upload</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await resolveMedia({ eventId: event.eventId, status: "no_media" });
                      setMessage(`Marked "${event.title}" as no photos/videos.`);
                    } catch (error) {
                      setMessage(getConvexErrorMessage(error));
                    }
                  }}
                >
                  No photos/videos
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
