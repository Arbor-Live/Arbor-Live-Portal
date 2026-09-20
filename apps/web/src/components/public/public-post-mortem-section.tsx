"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PostMortemFeedbackFormValues } from "@/lib/validations/crew-availability";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";

export function PublicPostMortemSection({ token }: { token: string }) {
  const status = useQuery(api.postMortemFeedback.getStatusByToken, { token });
  const submit = useMutation(api.postMortemFeedback.submitByToken);

  const onSubmit = async (values: PostMortemFeedbackFormValues) => {
    await submit({
      token,
      rating: values.rating,
      whatWentWell: values.whatWentWell.trim(),
      whatCouldImprove: values.whatCouldImprove.trim(),
    });
  };

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
            <PostMortemForm onSubmit={onSubmit} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
