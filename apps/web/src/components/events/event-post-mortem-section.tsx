"use client";

import { useMutation, useQuery } from "convex/react";
import { StarIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";

/**
 * In-app post-mortem for the day-of lead / event manager. Only the assigned
 * lead sees this, and only after the event has ended. The emailed token form
 * (`/postmortem/[token]`) remains the fallback.
 */
export function EventPostMortemSection({ eventId }: { eventId: Id<"events"> }) {
  const status = useQuery(api.postMortemFeedback.getMyPostMortemForEvent, { eventId });
  const submit = useMutation(api.postMortemFeedback.submitForEvent);

  if (!status || !status.eventEnded) return null;

  if (status.submitted) {
    const rating = status.rating ?? 0;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post-mortem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <StarIcon
                key={value}
                className={value <= rating ? "size-4 text-amber-500" : "size-4 text-muted-foreground/40"}
                weight={value <= rating ? "fill" : "regular"}
              />
            ))}
          </div>
          <div className="space-y-1">
            <p className="font-medium">What went well</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{status.whatWentWell}</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">What could have gone better</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{status.whatCouldImprove}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post-mortem</CardTitle>
      </CardHeader>
      <CardContent>
        <PostMortemForm
          onSubmit={async (values) => {
            await submit({
              eventId,
              rating: values.rating,
              whatWentWell: values.whatWentWell.trim(),
              whatCouldImprove: values.whatCouldImprove.trim(),
            });
          }}
        />
      </CardContent>
    </Card>
  );
}
