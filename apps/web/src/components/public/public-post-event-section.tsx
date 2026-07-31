"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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

export function PublicPostEventSection({
  portal,
  token,
}: {
  portal: FeedbackPortal;
  token: string;
}) {
  const status = useQuery(api.eventFeedback.getStatusByToken, { portal, token });
  const submit = useMutation(api.eventFeedback.submitByToken);
  const [hoveredRating, setHoveredRating] = useState(0);

  const form = useConvexForm<EventFeedbackFormValues>({
    schema: eventFeedbackSchema,
    defaultValues: { rating: 0, comments: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    await submit({
      portal,
      token,
      rating: values.rating,
      comments: values.comments.trim(),
    });
    form.reset({ rating: 0, comments: "" });
  });

  useEffect(() => {
    if (status === undefined) return;
    if (window.location.hash === "#feedback") {
      document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  if (status === undefined) return null;
  if (!status || !status.eventEnded) return null;

  const rating = form.watch("rating") ?? 0;

  return (
    <div className="space-y-4" id="feedback">
      {status.albumShareUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>Photo album</CardTitle>
            <CardDescription>
              Photos and videos from {status.eventTitle ?? "your event"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href={status.albumShareUrl} target="_blank" rel="noreferrer">
                View the album
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {status.submitted ? (
        <Card>
          <CardHeader>
            <CardTitle>Event feedback</CardTitle>
            <CardDescription>
              Thanks for your feedback on {status.eventTitle ?? "your event"} — we really
              appreciate it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>How was {status.eventTitle ?? "your event"}?</CardTitle>
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
                                className="rounded-sm p-1 transition-colors hover:text-amber-500"
                                onMouseEnter={() => setHoveredRating(value)}
                                onClick={() => {
                                  field.onChange(value);
                                  void form.trigger("rating");
                                }}
                              >
                                <StarIcon
                                  className={cn(
                                    "size-7",
                                    filled ? "text-amber-500" : "text-muted-foreground/40",
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
