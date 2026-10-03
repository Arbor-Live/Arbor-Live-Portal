"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { PageHeader } from "@/components/page-header";
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

  const albumOptions = [
    {
      value: "band",
      label: activeOrg?.name ? `${activeOrg.name} (all artist media)` : "Artist album",
      description: "Photos and videos for your profile",
    },
    ...eventOptions,
  ];

  return (
    <BandOnlyGuard>
      <div className="space-y-4 pb-20" data-testid="band-media">
        <PageHeader
          title="Media"
          description="Photos and videos for your artist profile and your shows. Uploads go to the album you pick."
          meta={
            album?.albumUrl ? (
              <MediaAlbumLink albumName={album.albumName} albumUrl={album.albumUrl} />
            ) : undefined
          }
        >
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="band-media-album">Album</Label>
            <SearchableSelect
              id="band-media-album"
              value={selectedEventId || "band"}
              onChange={(value) => setSelectedEventId(value === "band" ? "" : value)}
              options={albumOptions}
              placeholder="Artist album"
            />
          </div>
        </PageHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
                ? "No photos or videos from this show yet. Upload some above."
                : "No artist media yet. Upload photos or videos above."
            }
            loadMore={() => loadMore(60)}
            canLoadMore={assetsStatus === "CanLoadMore"}
            isLoadingMore={assetsStatus === "LoadingMore"}
          />
        )}
      </div>
    </BandOnlyGuard>
  );
}
