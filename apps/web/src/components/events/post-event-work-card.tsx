"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircleIcon, StarIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type PostEventWorkRow = {
  eventId: Id<"events">;
  title: string;
  venueName?: string;
  endAt: number;
  feedbackSubmitted: boolean;
  rating?: number;
  whatWentWell?: string;
  whatCouldImprove?: string;
  mediaResolved: boolean;
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <StarIcon
          key={value}
          className={cn(
            "size-4",
            value <= rating ? "text-amber-500" : "text-muted-foreground/30",
          )}
          weight={value <= rating ? "fill" : "regular"}
        />
      ))}
    </span>
  );
}

/** Review + photos for one ended event, used on the My Post-event work page. */
export function PostEventWorkCard({ row }: { row: PostEventWorkRow }) {
  const submit = useMutation(api.postMortemFeedback.submitForEvent);
  const resolveMedia = useMutation(api.crewPortal.resolveMyEventMedia);
  const [markingNoMedia, setMarkingNoMedia] = useState(false);

  async function markNoMedia() {
    setMarkingNoMedia(true);
    try {
      await resolveMedia({ eventId: row.eventId, status: "no_media" });
      notify.success(`Marked "${row.title}" as no photos/videos.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setMarkingNoMedia(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="text-base">{row.title}</CardTitle>
          <p className="text-xs text-muted-foreground">Ended {formatDateTime(row.endAt)}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {row.feedbackSubmitted ? (
          <div className="space-y-3 text-sm">
            <RatingStars rating={row.rating ?? 0} />
            <div className="space-y-1">
              <p className="font-medium">What went well</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{row.whatWentWell}</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">What could have gone better</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{row.whatCouldImprove}</p>
            </div>
          </div>
        ) : (
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
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Photos &amp; videos</p>
            {row.mediaResolved ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircleIcon className="size-4" weight="fill" />
                Media resolved
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={markingNoMedia}
                onClick={() => void markNoMedia()}
              >
                {markingNoMedia ? "Saving…" : "No photos/videos"}
              </Button>
            )}
          </div>
          <MediaUploadDropzone
            targetType="event"
            targetId={row.eventId}
            onUploaded={() => notify.success("Upload complete.")}
          />
        </div>
      </CardContent>
    </Card>
  );
}
