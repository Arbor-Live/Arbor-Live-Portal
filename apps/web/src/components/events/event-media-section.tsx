"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  MinusCircleIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { MediaGallery } from "@/components/media/media-gallery";
import { MediaAlbumLink } from "@/components/media/media-album-link";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { getConvexErrorMessage } from "@/lib/convex-error";

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

type ParticipationRole = "headliner" | "support" | "other";

type ParticipationDraft = {
  organizationId: string;
  role: ParticipationRole;
};

const ROLE_OPTIONS = [
  { value: "headliner", label: "Headliner" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

export function EventMediaSection({ eventId }: { eventId: Id<"events"> }) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const participations = useQuery(api.eventBands.listByEvent, { eventId });
  const media = useQuery(api.immich.listEventMedia, { eventId });
  const ensureUploadAlbum = useAction(api.immichEnsure.ensureUploadAlbum);
  const upsertParticipations = useMutation(api.eventBands.upsertParticipations);

  const [drafts, setDrafts] = useState<ParticipationDraft[]>([]);
  const [ensuring, setEnsuring] = useState(false);
  const [savingBands, setSavingBands] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [albumReady, setAlbumReady] = useState(false);

  useEffect(() => {
    if (!participations) return;
    setDrafts(
      participations.map((row) => ({
        organizationId: row.organizationId,
        role: row.role,
      })),
    );
  }, [participations]);

  useEffect(() => {
    let cancelled = false;
    async function ensure() {
      setEnsuring(true);
      try {
        await ensureUploadAlbum({ targetType: "event", targetId: eventId });
        if (!cancelled) setAlbumReady(true);
      } catch (error) {
        if (!cancelled) setMessage(getConvexErrorMessage(error));
      } finally {
        if (!cancelled) setEnsuring(false);
      }
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [ensureUploadAlbum, eventId]);

  const bandOptions = useMemo(
    () =>
      (bands ?? []).map((band) => ({
        value: band.organizationId,
        label: band.displayName || band.name,
      })),
    [bands],
  );

  async function onSaveBands() {
    setSavingBands(true);
    setMessage(null);
    try {
      await upsertParticipations({
        eventId,
        participations: drafts.filter((row) => row.organizationId),
      });
      setMessage("Linked bands saved.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    } finally {
      setSavingBands(false);
    }
  }

  function addBandRow() {
    setDrafts((prev) => [...prev, { organizationId: "", role: "headliner" }]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Linked Bands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Link band organizations to this event. Linked bands can view and upload to this event&apos;s media album.
          </p>
          {drafts.map((row, index) => (
            <div key={`band-link-${index}`} className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
              <SearchableSelect
                value={row.organizationId}
                onChange={(value) =>
                  setDrafts((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, organizationId: value } : entry,
                    ),
                  )
                }
                options={bandOptions}
                placeholder="Select band…"
                emptyLabel="Select band"
              />
              <SearchableSelect
                value={row.role}
                onChange={(value) =>
                  setDrafts((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, role: value as ParticipationRole }
                        : entry,
                    ),
                  )
                }
                options={ROLE_OPTIONS}
                placeholder="Role"
                emptyLabel="Role"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrafts((prev) => prev.filter((_, entryIndex) => entryIndex !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addBandRow}>
              Add band
            </Button>
            <Button type="button" onClick={() => void onSaveBands()} disabled={savingBands}>
              {savingBands ? "Saving…" : "Save linked bands"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <CrewMediaStatusCard eventId={eventId} />

      <Card>
        <CardHeader>
          <CardTitle>Event Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  setMessage("Upload complete.");
                }}
              />
              <MediaGallery assets={media?.assets ?? []} />
            </>
          )}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
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
