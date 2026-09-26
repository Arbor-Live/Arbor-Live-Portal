"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { StarIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import { cn } from "@/lib/utils";
import {
  eventFeedbackSchema,
  type EventFeedbackFormValues,
} from "@/lib/validations/crew-availability";

export type FeedbackPortal = "request" | "quote";

type FeedbackDay = NonNullable<
  FunctionReturnType<typeof api.eventFeedback.getStatusByToken>
>["days"][number];

export function PublicPostEventSection({
  portal,
  token,
}: {
  portal: FeedbackPortal;
  token: string;
}) {
  const status = useQuery(api.eventFeedback.getStatusByToken, { portal, token });
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    if (status === undefined) return;
    if (window.location.hash === "#feedback") {
      document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  if (status === undefined) return null;
  if (!status || !status.eventEnded) return null;

  const days = status.days;
  const firstEndedIndex = Math.max(
    0,
    days.findIndex((day) => day.ended),
  );
  const dayIndex = days[selectedDay]?.ended ? selectedDay : firstEndedIndex;
  const selected = days[dayIndex];
  if (!selected) return null;

  return (
    <div className="space-y-4" id="feedback">
      {days.length > 1 ? (
        <div role="tablist" aria-label="Event day" className="flex flex-wrap gap-2">
          {days.map((day, index) => (
            <Button
              key={day.eventId}
              type="button"
              role="tab"
              size="sm"
              variant={index === dayIndex ? "default" : "outline"}
              aria-selected={index === dayIndex}
              disabled={!day.ended}
              onClick={() => setSelectedDay(index)}
            >
              Day {index + 1}
            </Button>
          ))}
        </div>
      ) : null}
      <PublicPostEventDayContent
        key={selected.eventId}
        portal={portal}
        token={token}
        day={selected}
      />
    </div>
  );
}

function PublicPostEventDayContent({
  portal,
  token,
  day,
}: {
  portal: FeedbackPortal;
  token: string;
  day: FeedbackDay;
}) {
  const ensureAlbum = useAction(api.eventFeedbackActions.ensureAlbumShareUrlByToken);
  const submit = useMutation(api.eventFeedback.submitByToken);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [ensuredAlbumUrl, setEnsuredAlbumUrl] = useState<string | undefined>();

  const form = useConvexForm<EventFeedbackFormValues>({
    schema: eventFeedbackSchema,
    defaultValues: { rating: 0, comments: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    await submit({
      portal,
      token,
      eventId: day.eventId,
      rating: values.rating,
      comments: values.comments.trim(),
    });
    form.reset({ rating: 0, comments: "" });
  });

  useEffect(() => {
    if (!day.ended) return;
    if (day.albumShareUrl || ensuredAlbumUrl) return;
    let cancelled = false;
    void ensureAlbum({ portal, token, eventId: day.eventId })
      .then((result) => {
        if (cancelled) return;
        if (result?.albumShareUrl) setEnsuredAlbumUrl(result.albumShareUrl);
      })
      .catch(() => {
        // Immich is optional — leave the album card hidden if ensure fails.
      });
    return () => {
      cancelled = true;
    };
  }, [day.ended, day.albumShareUrl, day.eventId, ensuredAlbumUrl, ensureAlbum, portal, token]);

  const rating = form.watch("rating") ?? 0;
  const albumShareUrl = day.albumShareUrl ?? ensuredAlbumUrl;
  const eventTitle = day.eventTitle;

  return (
    <div className="space-y-4">
      {albumShareUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>Photo album</CardTitle>
            <CardDescription>
              Photos and videos from {eventTitle}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href={albumShareUrl} target="_blank" rel="noreferrer">
                View the album
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {day.submitted ? (
        <Card>
          <CardHeader>
            <CardTitle>Event feedback</CardTitle>
            <CardDescription>
              Thanks for your feedback on {eventTitle} — we really
              appreciate it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>How was {eventTitle}?</CardTitle>
            <CardDescription>
              Your feedback helps us improve how we run events for clients like you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  name="rating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overall rating</FormLabel>
                      <FormControl>
                        <div
                          className="flex w-fit items-center gap-1 rounded-md border border-input px-2 py-1"
                          onMouseLeave={() => setHoveredRating(0)}
                        >
                          {[1, 2, 3, 4, 5].map((value) => {
                            const filled = value <= (hoveredRating || field.value);
                            return (
                              <button
                                key={value}
                                type="button"
                                aria-label={`${value} star${value > 1 ? "s" : ""}`}
                                className="rounded-sm p-1 transition-colors hover:text-status-amber-500"
                                onMouseEnter={() => setHoveredRating(value)}
                                onClick={() => {
                                  field.onChange(value);
                                  void form.trigger("rating");
                                }}
                              >
                                <StarIcon
                                  className={cn(
                                    "size-7",
                                    filled ? "text-status-amber-500" : "text-muted-foreground/40",
                                  )}
                                  weight={filled ? "fill" : "regular"}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <TextareaFormField
                  name="comments"
                  label="Your feedback"
                  placeholder="What went well? What could we improve?"
                  rows={4}
                />
                <Button type="submit" disabled={form.saveStatus === "saving" || rating < 1}>
                  {form.saveStatus === "saving" ? "Submitting..." : "Submit feedback"}
                </Button>
                {form.saveError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{form.saveError}</AlertDescription>
                  </Alert>
                ) : null}
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
