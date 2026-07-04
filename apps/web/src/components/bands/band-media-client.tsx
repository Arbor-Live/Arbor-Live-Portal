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
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { BandOnlyGuard } from "@/components/org-context-guard";
import { getConvexErrorMessage } from "@/lib/convex-error";

function formatEventLabel(title: string, startAt: number) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startAt));
  return `${title} — ${date}`;
}

export function BandMediaClient() {
  const activeOrg = useQuery(api.users.getActiveOrganization, {});
  const linkedEvents = useQuery(api.eventBands.listLinkedEventsForActiveBand, {});
  const ensureBandAlbum = useAction(api.immichEnsure.ensureBandAlbum);
  const ensureEventAlbum = useAction(api.immichEnsure.ensureEventAlbum);

  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [albumReady, setAlbumReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const media = useQuery(
    api.immich.listBandMedia,
    activeOrg?.organizationType === "band"
      ? selectedEventId
        ? { eventId: selectedEventId as Id<"events"> }
        : {}
      : "skip",
  );

  useEffect(() => {
    if (activeOrg?.organizationType !== "band") return;
    let cancelled = false;
    async function ensure() {
      try {
        await ensureBandAlbum({});
        if (!cancelled) setAlbumReady(true);
      } catch (ensureError) {
        if (!cancelled) setError(getConvexErrorMessage(ensureError));
      }
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [activeOrg?.organizationType, ensureBandAlbum]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    async function ensure() {
      try {
        await ensureEventAlbum({ eventId: selectedEventId as Id<"events"> });
        if (!cancelled) setAlbumReady(true);
      } catch (ensureError) {
        if (!cancelled) setError(getConvexErrorMessage(ensureError));
      }
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [ensureEventAlbum, selectedEventId]);

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
                onValueChange={(value) => setSelectedEventId(value === "band" ? "" : value)}
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
