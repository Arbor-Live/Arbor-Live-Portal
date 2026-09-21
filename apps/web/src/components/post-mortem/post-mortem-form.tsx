"use client";

import { useState } from "react";
import { StarIcon } from "@phosphor-icons/react";
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

export function PostMortemForm({
  onSubmit,
  submitLabel = "Submit post-mortem",
}: {
  onSubmit: (values: PostMortemFeedbackFormValues) => Promise<void>;
  submitLabel?: string;
}) {
  const [hoveredRating, setHoveredRating] = useState(0);

  const form = useConvexForm<PostMortemFeedbackFormValues>({
    schema: postMortemFeedbackSchema,
    defaultValues: { rating: 0, whatWentWell: "", whatCouldImprove: "" },
    mode: "onTouched",
  });

  const submit = form.submitMutation(async (values) => {
    await onSubmit(values);
    form.reset({ rating: 0, whatWentWell: "", whatCouldImprove: "" });
  });

  const rating = form.watch("rating") ?? 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
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
          {form.saveStatus === "saving" ? "Submitting..." : submitLabel}
        </Button>
        {form.saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{form.saveError}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </Form>
  );
}
