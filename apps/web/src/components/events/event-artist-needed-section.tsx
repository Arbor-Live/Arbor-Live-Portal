"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { ArborOnlyGuard } from "@/components/org-context-guard";

type ArtistNeedType = "band" | "dj" | "no_preference";
type ArtistNeedStatus = "open" | "inquiring";
type EffectiveArtistNeedStatus = ArtistNeedStatus | "booked";

const TYPE_OPTIONS = [
  { value: "band", label: "Live band" },
  { value: "dj", label: "DJ" },
  { value: "no_preference", label: "No preference" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "inquiring", label: "Inquiring" },
];

function effectiveStatusClass(status: EffectiveArtistNeedStatus) {
  switch (status) {
    case "booked":
      return "bg-status-emerald-500/15 text-status-emerald-800 dark:text-status-emerald-200";
    case "inquiring":
      return "bg-status-amber-500/15 text-status-amber-800 dark:text-status-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function effectiveStatusLabel(status: EffectiveArtistNeedStatus) {
  if (status === "booked") return "Booked";
  if (status === "inquiring") return "Inquiring";
  return "Open";
}

export function EventArtistNeededSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventArtistNeededPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventArtistNeededPanel({ eventId }: { eventId: Id<"events"> }) {
  const { confirm } = useAppDialog();
  const data = useQuery(api.eventArtistNeeds.getForEvent, { eventId });
  const upsert = useMutation(api.eventArtistNeeds.upsertForEvent);
  const remove = useMutation(api.eventArtistNeeds.removeForEvent);
  const dismiss = useMutation(api.eventArtistNeeds.dismissInquiry);

  const [artistType, setArtistType] = useState<ArtistNeedType>("no_preference");
  const [genres, setGenres] = useState("");
  const [status, setStatus] = useState<ArtistNeedStatus>("open");
  const [saving, setSaving] = useState(false);
  const hydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    // Include `updatedAt` so background changes (e.g. an inquiry flipping the
    // need to inquiring) rehydrate the local form, not just a new need id.
    const key = data.need ? `${data.need._id}:${data.need.updatedAt}` : "none";
    if (hydratedRef.current === key) return;
    hydratedRef.current = key;
    setArtistType(data.need?.artistType ?? "no_preference");
    setGenres(data.need?.genres ?? "");
    setStatus(data.need?.status ?? "open");
  }, [data]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsert({
        eventId,
        artistType,
        genres: genres.trim() || undefined,
        status,
      });
      notify.success("Artist need saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remove artist need?",
      description: "This clears the request and any artist inquiries on it.",
      destructive: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await remove({ eventId });
      hydratedRef.current = null;
      notify.success("Artist need removed.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function handleDismiss(inquiryId: Id<"eventArtistInquiries">) {
    try {
      await dismiss({ inquiryId });
      notify.success("Inquiry dismissed.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const currentStatus = data?.need?.effectiveStatus ?? "open";
  const inquiries = data?.inquiries ?? [];
  const bookedArtists = data?.bookedArtists ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Artist Needed</CardTitle>
        <span
          data-testid="artist-need-status"
          className={`rounded-md px-2 py-1 text-xs font-medium ${effectiveStatusClass(currentStatus)}`}
        >
          {effectiveStatusLabel(currentStatus)}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Looking for</Label>
            <SearchableSelect
              value={artistType}
              onChange={(value) => setArtistType(value as ArtistNeedType)}
              options={TYPE_OPTIONS}
              placeholder="Select type"
              emptyLabel="Select type"
            />
          </div>
          <div className="space-y-1">
            <Label>Genres / vibes</Label>
            <Input
              value={genres}
              onChange={(event) => setGenres(event.target.value)}
              placeholder="e.g. indie, jazz, house"
            />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <SearchableSelect
              value={status}
              onChange={(value) => setStatus(value as ArtistNeedStatus)}
              options={STATUS_OPTIONS}
              placeholder="Select status"
              emptyLabel="Select status"
            />
          </div>
        </div>

        {bookedArtists.length > 0 ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Booked: </span>
            {bookedArtists.map((artist) => artist.name).join(", ")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {data?.need ? "Save need" : "Post an artist need"}
          </Button>
          {data?.need ? (
            <Button type="button" variant="outline" onClick={() => void handleRemove()}>
              Remove
            </Button>
          ) : null}
        </div>

        {inquiries.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Inquiries</p>
            <ul className="space-y-2">
              {inquiries.map((inquiry) => (
                <li
                  key={inquiry._id}
                  className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {inquiry.name}
                      {inquiry.status === "dismissed" ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Dismissed
                        </span>
                      ) : null}
                    </p>
                    {inquiry.message ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{inquiry.message}</p>
                    ) : null}
                  </div>
                  {inquiry.status === "submitted" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDismiss(inquiry._id)}
                    >
                      Dismiss
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
