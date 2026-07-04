"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { MediaGallery } from "@/components/media/media-gallery";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { getConvexErrorMessage } from "@/lib/convex-error";

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
  const ensureEventAlbum = useAction(api.immichEnsure.ensureEventAlbum);
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
        await ensureEventAlbum({ eventId });
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
  }, [ensureEventAlbum, eventId]);

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

      <Card>
        <CardHeader>
          <CardTitle>Event Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ensuring ? (
            <p className="text-sm text-muted-foreground">Preparing media album…</p>
          ) : (
            <>
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
