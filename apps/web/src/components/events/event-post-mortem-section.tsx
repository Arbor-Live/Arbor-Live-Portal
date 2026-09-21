"use client";

import { useMutation, useQuery } from "convex/react";
import { StarIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";
import { cn } from "@/lib/utils";

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <StarIcon
          key={value}
          className={cn(
            "size-4",
            value <= rating ? "text-status-amber-500" : "text-muted-foreground/30",
          )}
          weight={value <= rating ? "fill" : "regular"}
        />
      ))}
    </span>
  );
}

/**
 * The signed-in crew member's own post-event review, inline on the event page.
 * Any assigned crew member or lead sees it once the event has ended; the
 * emailed token form (`/postmortem/[token]`) remains the fallback.
 */
export function EventPostMortemSection({ eventId }: { eventId: Id<"events"> }) {
  const status = useQuery(api.postMortemFeedback.getMyPostMortemForEvent, { eventId });
  const submit = useMutation(api.postMortemFeedback.submitForEvent);

  if (!status || !status.eventEnded) return null;

  if (status.submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post-event review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <RatingStars rating={status.rating ?? 0} />
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
        <CardTitle>Post-event review</CardTitle>
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

/** Every review filed for the event, with the average. Leads / admins only. */
export function EventPostMortemSummary({ eventId }: { eventId: Id<"events"> }) {
  const summary = useQuery(api.postMortemFeedback.getEventPostMortemSummary, { eventId });

  if (!summary || summary.count === 0) return null;
  const average = summary.averageRating ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post-event reviews</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tabular-nums">{average.toFixed(1)}</span>
          <RatingStars rating={Math.round(average)} />
          <span className="text-muted-foreground">
            {summary.count} response{summary.count === 1 ? "" : "s"}
          </span>
        </div>

        <ul className="divide-y">
          {summary.entries.map((entry) => (
            <li key={entry.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{entry.personName ?? "Crew"}</span>
                {entry.role ? (
                  <span className="text-muted-foreground">· {entry.role}</span>
                ) : null}
                <RatingStars rating={entry.rating} />
              </div>
              <div className="space-y-1 text-muted-foreground">
                <p className="text-xs font-medium text-foreground/70">What went well</p>
                <p className="whitespace-pre-wrap">{entry.whatWentWell}</p>
              </div>
              <div className="space-y-1 text-muted-foreground">
                <p className="text-xs font-medium text-foreground/70">What could improve</p>
                <p className="whitespace-pre-wrap">{entry.whatCouldImprove}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
