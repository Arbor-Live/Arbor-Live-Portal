"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
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
import { useMediaAlbum, type MediaAlbumTarget } from "@/hooks/use-media-album";
import { formatDate } from "@/lib/format";
import { isArtistOrganizationType } from "@/lib/artist-types";

function formatEventLabel(title: string, startAt: number) {
  return `${title} — ${formatDate(startAt)}`;
}

export function BandMediaClient() {
  const shell = useSessionShell();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);
  const linkedEvents = useQuery(api.eventBands.listLinkedEventsForActiveBand, {});

  const [selectedEventId, setSelectedEventId] = useState<string>("");

  const isArtistOrg = isArtistOrganizationType(activeOrg?.organizationType);

  const mediaArgs = isArtistOrg
    ? selectedEventId
      ? { eventId: selectedEventId as Id<"events"> }
      : {}
    : "skip";

  const album = useQuery(api.immich.getBandMediaAlbum, mediaArgs);
  const {
    results: assets,
    status: assetsStatus,
    loadMore,
  } = usePaginatedQuery(api.immich.listBandMediaAssets, mediaArgs, {
    initialNumItems: 60,
  });

  const uploadTargetType = selectedEventId ? "event" : "band";
  const uploadTargetId = selectedEventId || activeOrg?.organizationId || "";

  const albumTarget = useMemo<MediaAlbumTarget | null>(() => {
    if (!activeOrg || !isArtistOrganizationType(activeOrg.organizationType)) return null;
    if (selectedEventId) return { targetType: "event", targetId: selectedEventId };
    return { targetType: "band", targetId: activeOrg.organizationId };
  }, [activeOrg, selectedEventId]);

  const { ready: albumReady, error } = useMediaAlbum(albumTarget);

  const eventOptions = useMemo(
    () =>
      (linkedEvents ?? []).map((event) => ({
        value: event.eventId,
        label: formatEventLabel(event.title, event.startAt),
      })),
    [linkedEvents],
  );

  return (
    <BandOnlyGuard>
      <div className="space-y-4 pb-20">
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              View and upload photos and videos for your artist profile or linked events.
            </p>

            <div className="space-y-2 max-w-md">
              <Label>Album</Label>
              <Select
                value={selectedEventId || "band"}
                onValueChange={(value) => {
                  setSelectedEventId(value === "band" ? "" : value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Artist album" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="band">
                    {activeOrg?.name ? `${activeOrg.name} (all artist media)` : "Artist album"}
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

            {album ? (
              <MediaAlbumLink albumName={album.albumName} albumUrl={album.albumUrl} />
            ) : null}

            <MediaUploadDropzone
              targetType={uploadTargetType}
              targetId={uploadTargetId}
              disabled={!albumReady || !uploadTargetId}
            />

            {assetsStatus === "LoadingFirstPage" ? (
              <p className="text-sm text-muted-foreground">Loading media…</p>
            ) : (
              <MediaGallery
                assets={assets}
                emptyMessage={
                  selectedEventId
                    ? "No event media yet. Upload photos or videos above."
                    : "No artist media yet. Upload photos or videos above."
                }
                loadMore={() => loadMore(60)}
                canLoadMore={assetsStatus === "CanLoadMore"}
                isLoadingMore={assetsStatus === "LoadingMore"}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </BandOnlyGuard>
  );
}
