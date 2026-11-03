"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";
import { PostMortemAnswers } from "@/components/post-mortem/post-mortem-answers";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { useMediaAlbum } from "@/hooks/use-media-album";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

export type PostEventWorkRow = {
  eventId: Id<"events">;
  title: string;
  venueName?: string;
  endAt: number;
  feedbackSubmitted: boolean;
  rating?: number;
  peakTurnout?: number;
  whatWentWell?: string;
  whatCouldImprove?: string;
  mediaResolved: boolean;
};

/** Review + photos for one ended event, used on the My Post-event work page. */
export function PostEventWorkCard({ row }: { row: PostEventWorkRow }) {
  const submit = useMutation(api.postMortemFeedback.submitForEvent);
  const resolveMedia = useMutation(api.crewPortal.resolveMyEventMedia);
  const album = useMediaAlbum({ targetType: "event", targetId: row.eventId });
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
          <PostMortemAnswers
            rating={row.rating ?? 0}
            peakTurnout={row.peakTurnout}
            whatWentWell={row.whatWentWell}
            whatCouldImprove={row.whatCouldImprove}
          />
        ) : (
          <PostMortemForm
            onSubmit={async (values) => {
              await submit({ eventId: row.eventId, ...values });
            }}
          />
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Photos &amp; videos</p>
            {row.mediaResolved ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-status-emerald-700">
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
            disabled={!album.ready}
            onUploaded={() => notify.success("Upload complete.")}
          />
          {album.error ? <p className="text-sm text-destructive">{album.error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
