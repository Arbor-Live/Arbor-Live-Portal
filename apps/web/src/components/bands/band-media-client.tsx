"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaGallery } from "@/components/media/media-gallery";
import { MediaAlbumLink } from "@/components/media/media-album-link";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { BandOnlyGuard } from "@/components/org-context-guard";
import { useSessionShell } from "@/components/session-shell-provider";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate } from "@/lib/format";

function formatEventLabel(title: string, startAt: number) {
  return `${title} — ${formatDate(startAt)}`;
}

export function BandMediaClient() {
  const shell = useSessionShell();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);
  const linkedEvents = useQuery(api.eventBands.listLinkedEventsForActiveBand, {});
  const ensureUploadAlbum = useAction(api.immichEnsure.ensureUploadAlbum);

  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [readyAlbumKey, setReadyAlbumKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureAlbumKey =
    activeOrg?.organizationType === "band"
      ? selectedEventId
        ? `event:${selectedEventId}`
        : `band:${activeOrg.organizationId}`
      : null;
  const albumReady = ensureAlbumKey !== null && readyAlbumKey === ensureAlbumKey;

  const media = useQuery(
    api.immich.listBandMedia,
    activeOrg?.organizationType === "band"
      ? selectedEventId
        ? { eventId: selectedEventId as Id<"events"> }
        : {}
      : "skip",
  );

  useEffect(() => {
    if (!ensureAlbumKey) return;
    let cancelled = false;
    async function ensure() {
      try {
        if (!activeOrg?.organizationId) return;
        if (selectedEventId) {
          await ensureUploadAlbum({ targetType: "event", targetId: selectedEventId });
        } else {
          await ensureUploadAlbum({
            targetType: "band",
            targetId: activeOrg.organizationId,
          });
        }
        if (!cancelled) {
          setReadyAlbumKey(ensureAlbumKey);
          setError(null);
        }
      } catch (ensureError) {
        if (!cancelled) setError(getConvexErrorMessage(ensureError));
      }
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [activeOrg?.organizationId, ensureAlbumKey, ensureUploadAlbum, selectedEventId]);

  const eventOptions = useMemo(
    () =>
      (linkedEvents ?? []).map((event) => ({
        value: event.eventId,
        label: formatEventLabel(event.title, event.startAt),
      })),
    [linkedEvents],
  );

  const uploadTargetType = selectedEventId ? "event" : "band";
  const uploadTargetId = selectedEventId || activeOrg?.organizationId || "";

  return (
    <BandOnlyGuard>
      <div className="space-y-4 pb-20">
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              View and upload photos and videos for your band or linked events.
            </p>

            <div className="space-y-2 max-w-md">
              <Label>Album</Label>
              <Select
                value={selectedEventId || "band"}
                onValueChange={(value) => {
                  setSelectedEventId(value === "band" ? "" : value);
                  setError(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Band album" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="band">
                    {activeOrg?.name ? `${activeOrg.name} (all band media)` : "Band album"}
                  </SelectItem>
                  {eventOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {media?.album ? (
              <MediaAlbumLink albumName={media.album.albumName} albumUrl={media.album.albumUrl} />
            ) : null}

            <MediaUploadDropzone
              targetType={uploadTargetType}
              targetId={uploadTargetId}
              disabled={!albumReady || !uploadTargetId}
            />

            {media === undefined ? (
              <p className="text-sm text-muted-foreground">Loading media…</p>
            ) : (
              <MediaGallery
                assets={media.assets}
                emptyMessage={
                  selectedEventId
                    ? "No event media yet. Upload photos or videos above."
                    : "No band media yet. Upload photos or videos above."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </BandOnlyGuard>
  );
}
