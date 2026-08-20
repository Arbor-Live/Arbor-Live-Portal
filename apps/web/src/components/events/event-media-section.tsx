"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  MinusCircleIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaGallery } from "@/components/media/media-gallery";
import { MediaAlbumLink } from "@/components/media/media-album-link";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

type CrewMediaStatus = "pending" | "uploaded" | "no_media";

function statusBadgeClass(status: CrewMediaStatus) {
  if (status === "pending") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  if (status === "uploaded") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function statusLabel(status: CrewMediaStatus) {
  if (status === "pending") return "Pending";
  if (status === "uploaded") return "Uploaded";
  return "No photos/videos";
}

function statusIconClass(status: CrewMediaStatus) {
  if (status === "pending") return "text-amber-600";
  if (status === "uploaded") return "text-emerald-600";
  return "text-muted-foreground";
}

function StatusIcon({ status }: { status: CrewMediaStatus }) {
  if (status === "pending") return <ClockIcon className={`size-4 ${statusIconClass(status)}`} />;
  if (status === "uploaded") return <CheckCircleIcon className={`size-4 ${statusIconClass(status)}`} />;
  return <MinusCircleIcon className={`size-4 ${statusIconClass(status)}`} />;
}

export function EventMediaSection({ eventId }: { eventId: Id<"events"> }) {
  const media = useQuery(api.immich.listEventMedia, { eventId });
  const ensureUploadAlbum = useAction(api.immichEnsure.ensureUploadAlbum);

  const [ensuring, setEnsuring] = useState(false);
  const [albumReady, setAlbumReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ensure() {
      setEnsuring(true);
      try {
        await ensureUploadAlbum({ targetType: "event", targetId: eventId });
        if (!cancelled) setAlbumReady(true);
      } catch (error) {
        if (!cancelled) notify.error(getConvexErrorMessage(error));
      } finally {
        if (!cancelled) setEnsuring(false);
      }
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [ensureUploadAlbum, eventId]);

  return (
    <div className="space-y-4">
      <CrewMediaStatusCard eventId={eventId} />

      <Card>
        <CardHeader>
          <CardTitle>Event Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Bands assigned on the event overview can view and upload to this album.
          </p>
          {ensuring ? (
            <p className="text-sm text-muted-foreground">Preparing media album…</p>
          ) : (
            <>
              {media?.album ? (
                <MediaAlbumLink albumName={media.album.albumName} albumUrl={media.album.albumUrl} />
              ) : null}
              <MediaUploadDropzone
                targetType="event"
                targetId={eventId}
                disabled={!albumReady}
                onUploaded={() => {
                  notify.success("Upload complete.");
                }}
              />
              <MediaGallery assets={media?.assets ?? []} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CrewMediaStatusCard({ eventId }: { eventId: Id<"events"> }) {
  const rows = useQuery(api.crewPortal.listCrewMediaStatusForEvent, { eventId });

  if (rows === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CameraIcon className="size-4" />
            Crew media uploads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const noMediaCount = rows.filter((row) => row.status === "no_media").length;
  const uploadedCount = rows.filter((row) => row.status === "uploaded").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CameraIcon className="size-4" />
          Crew media uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Each crew member assigned to this event must mark that they uploaded photos/videos or
          have none. Follow up with crew who are still pending.
        </p>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700">
            {pendingCount} pending
          </span>
          <span className="rounded-full border bg-muted px-2 py-0.5 text-muted-foreground">
            {noMediaCount} no photos/videos
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700">
            {uploadedCount} uploaded
          </span>
        </div>

        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={row.userId}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name || row.email || row.userId}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.role ? `${row.role} · ` : ""}
                  {row.email || "No email on file"}
                </p>
              </div>
              <span
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.status)}`}
              >
                <StatusIcon status={row.status} />
                {statusLabel(row.status)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
