"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { StarIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";
import { formatDateTime } from "@/lib/format";

export function MyPostMortemsClient() {
  const [now] = useState(() => Date.now());
  const rows = useQuery(api.postMortemFeedback.listMyPostMortems, { now });
  const submit = useMutation(api.postMortemFeedback.submitForEvent);

  if (rows === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Post-mortems</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No post-mortems waiting on you.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Post-mortems</CardTitle>
        </CardHeader>
      </Card>
      {rows.map((row) =>
        row.submitted ? (
          <Card key={row.eventId}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">{row.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ended {formatDateTime(row.endAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <StarIcon
                    key={value}
                    className={
                      value <= (row.rating ?? 0)
                        ? "size-4 text-amber-500"
                        : "size-4 text-muted-foreground/40"
                    }
                    weight={value <= (row.rating ?? 0) ? "fill" : "regular"}
                  />
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/events/${row.eventId}`}>View event</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card key={row.eventId}>
            <CardHeader>
              <div className="space-y-1">
                <CardTitle className="text-base">{row.title}</CardTitle>
                <p className="text-xs text-muted-foreground">Ended {formatDateTime(row.endAt)}</p>
              </div>
            </CardHeader>
            <CardContent>
              <PostMortemForm
                onSubmit={async (values) => {
                  await submit({
                    eventId: row.eventId,
                    rating: values.rating,
                    whatWentWell: values.whatWentWell.trim(),
                    whatCouldImprove: values.whatCouldImprove.trim(),
                  });
                }}
              />
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
