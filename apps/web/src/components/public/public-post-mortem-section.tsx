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
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicPortalPageSkeleton } from "@/components/public/public-skeletons";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
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

  if (status === undefined) {
    return (
      <PublicSiteChrome>
        <PublicPortalPageSkeleton titleWidth="w-64" />
      </PublicSiteChrome>
    );
  }

  if (!status) {
    return (
      <PublicSiteChrome>
        <PublicPageHero
          title="Post-mortem"
          subtitle="This post-mortem form is not available."
        />
      </PublicSiteChrome>
    );
  }

  if (!status.eventEnded) {
    return (
      <PublicSiteChrome>
        <PublicPageHero
          title="Post-mortem"
          subtitle="This post-mortem opens once the event has ended."
        />
      </PublicSiteChrome>
    );
  }

  return (
    <PublicSiteChrome>
      <PublicPageHero
        title={status.eventTitle ? `${status.eventTitle} post-mortem` : "Event post-mortem"}
      />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
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
    </PublicSiteChrome>
  );
}
