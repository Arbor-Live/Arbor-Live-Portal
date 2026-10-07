"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatTime } from "@/lib/format";
import { formatClipDuration, RING_CLIP_KIND_LABELS, type RingClipKind } from "@/lib/ring-clips";
import { ringThumbnailSrc } from "@/lib/ring-thumbnail";

export type ClipRow = {
  _id: Id<"ringClips">;
  kind: RingClipKind;
  createdAt: number;
  durationSec: number | null;
  personDetected: boolean;
  thumbnailUrl: string | null;
};

/** Ring's video links expire; reuse one for a few minutes, then ask again. */
const URL_REUSE_MS = 5 * 60 * 1000;
const urlCache = new Map<string, { url: string; at: number }>();

function useClipUrl() {
  const getUrl = useAction(api.ringCameraActions.getClipVideoUrl);
  return useCallback(
    async (clipId: Id<"ringClips">) => {
      const cached = urlCache.get(clipId);
      if (cached && Date.now() - cached.at < URL_REUSE_MS) return cached.url;
      const url = await getUrl({ clipId });
      urlCache.set(clipId, { url, at: Date.now() });
      return url;
    },
    [getUrl],
  );
}

/** The thumbnail as something an `<img>` can show (Ring's are video frames), or null. */
export function useRingThumbnail(url: string | null) {
  const [loaded, setLoaded] = useState<{ url: string; src: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void ringThumbnailSrc(url).then((src) => {
      if (!cancelled) setLoaded({ url, src });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.src : null;
}

/** Ring records in HEVC, which Safari and Chrome on Mac play but Firefox doesn't. */
const UNSUPPORTED_VIDEO_MESSAGE =
  "This browser can't play Ring's video format (HEVC). Use Safari or Chrome, or open the video in a new tab.";

type VideoState = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

function ClipPlayer({ clip }: { clip: ClipRow }) {
  const getUrl = useClipUrl();
  const poster = useRingThumbnail(clip.thumbnailUrl);
  const [state, setState] = useState<VideoState>({ status: "loading" });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUrl(clip._id).then(
      (url) => {
        if (!cancelled) setState({ status: "ready", url });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: getConvexErrorMessage(error, "Couldn't load this clip from Ring.") });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [clip._id, getUrl, attempt]);

  if (state.status === "ready") {
    return (
      <video
        key={state.url}
        src={state.url}
        poster={poster ?? undefined}
        controls
        autoPlay
        playsInline
        className="aspect-video w-full bg-black"
        data-testid="ring-clip-video"
        onError={(event) => {
          const unsupported = event.currentTarget.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;
          setState({
            status: "error",
            message: unsupported ? UNSUPPORTED_VIDEO_MESSAGE : "Couldn't play this clip.",
          });
        }}
      />
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border border-dashed px-4 text-center text-sm text-muted-foreground">
        <p>{state.message}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            urlCache.delete(clip._id);
            setState({ status: "loading" });
            setAttempt((count) => count + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  return <Skeleton className="aspect-video w-full" />;
}

function OpenVideoLink({ clipId }: { clipId: Id<"ringClips"> }) {
  const getUrl = useClipUrl();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        // Open the tab synchronously so the popup blocker allows it, then point it at the fresh link.
        const tab = window.open("", "_blank");
        setPending(true);
        void getUrl(clipId)
          .then((url) => {
            if (tab) tab.location.href = url;
          })
          .catch(() => tab?.close())
          .finally(() => setPending(false));
      }}
    >
      Open video
      <ArrowSquareOutIcon className="size-3" />
    </Button>
  );
}

/**
 * Plays one clip. ← / → (or the footer buttons) step to the older / newer
 * clip in the loaded list.
 */
export function ClipSheet({
  clip,
  onOpenChange,
  onOlder,
  onNewer,
}: {
  clip: ClipRow | null;
  onOpenChange: (open: boolean) => void;
  onOlder: (() => void) | null;
  onNewer: (() => void) | null;
}) {
  useEffect(() => {
    if (!clip) return;
    function onKey(event: KeyboardEvent) {
      // The video's own controls use the arrow keys to seek.
      if (event.target instanceof HTMLVideoElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowLeft") onNewer?.();
      if (event.key === "ArrowRight") onOlder?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip, onNewer, onOlder]);

  const duration = clip ? formatClipDuration(clip.durationSec) : null;

  return (
    <DetailSheet open={clip !== null} onOpenChange={onOpenChange} testId="ring-clip-sheet" className="data-[side=right]:sm:max-w-2xl">
      {clip ? (
        <>
          <DetailSheetHeader
            title={`${RING_CLIP_KIND_LABELS[clip.kind]} · ${formatTime(clip.createdAt)}`}
            pill={clip.personDetected ? <StatusPill tone="amber">Person</StatusPill> : null}
            description={formatDate(clip.createdAt)}
          />
          <div className="px-4 pb-4">
            <ClipPlayer key={clip._id} clip={clip} />
          </div>
          <SheetSection title="Details">
            <SheetFields>
              <SheetField label="Type">{RING_CLIP_KIND_LABELS[clip.kind]}</SheetField>
              <SheetField label="Recorded">
                {formatDate(clip.createdAt)}, {formatTime(clip.createdAt)}
              </SheetField>
              <SheetField label="Length">{duration ?? "Still processing"}</SheetField>
              <SheetField label="Person detected">{clip.personDetected ? "Yes" : "No"}</SheetField>
            </SheetFields>
          </SheetSection>
          <DetailSheetFooter start={<OpenVideoLink clipId={clip._id} />}>
            <Button type="button" size="sm" variant="outline" disabled={!onNewer} onClick={() => onNewer?.()}>
              <CaretLeftIcon />
              Newer
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!onOlder} onClick={() => onOlder?.()}>
              Older
              <CaretRightIcon />
            </Button>
          </DetailSheetFooter>
        </>
      ) : null}
    </DetailSheet>
  );
}
