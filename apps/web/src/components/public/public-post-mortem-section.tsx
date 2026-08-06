"use client";

import { useState } from "react";
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
  postMortemFeedbackSchema,
  type PostMortemFeedbackFormValues,
} from "@/lib/validations/crew-availability";

export function PublicPostMortemSection({ token }: { token: string }) {
  const status = useQuery(api.postMortemFeedback.getStatusByToken, { token });
  const submit = useMutation(api.postMortemFeedback.submitByToken);
  const [hoveredRating, setHoveredRating] = useState(0);

  const form = useConvexForm<PostMortemFeedbackFormValues>({
    schema: postMortemFeedbackSchema,
    defaultValues: { rating: 0, whatWentWell: "", whatCouldImprove: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    await submit({
      token,
      rating: values.rating,
      whatWentWell: values.whatWentWell.trim(),
      whatCouldImprove: values.whatCouldImprove.trim(),
    });
    form.reset({ rating: 0, whatWentWell: "", whatCouldImprove: "" });
  });

  if (status === undefined) return null;
  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post-mortem</CardTitle>
          <CardDescription>This post-mortem form is not available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!status.eventEnded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post-mortem</CardTitle>
          <CardDescription>
            This post-mortem opens once the event has ended.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rating = form.watch("rating") ?? 0;

  return (
    <div className="space-y-4">
      {status.submitted ? (
        <Card>
          <CardHeader>
            <CardTitle>Post-mortem complete</CardTitle>
            <CardDescription>
              Thanks for your review of {status.eventTitle ?? "the event"} — we really appreciate
              it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>How did {status.eventTitle ?? "the event"} go?</CardTitle>
            <CardDescription>
              Your post-event review helps us run better shows. It only takes a minute.
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
                  name="whatWentWell"
                  label="What went well?"
                  placeholder="Crew, gear, communication, the show…"
                  rows={3}
                />
                <TextareaFormField
                  name="whatCouldImprove"
                  label="What could have gone better?"
                  placeholder="Anything we should do differently next time"
                  rows={3}
                />
                <Button type="submit" disabled={form.saveStatus === "saving" || rating < 1}>
                  {form.saveStatus === "saving" ? "Submitting..." : "Submit post-mortem"}
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
