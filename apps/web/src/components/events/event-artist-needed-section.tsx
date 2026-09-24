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

type SlotRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventArtistNeeds.getForEvent>>
>["slots"][number];

type SlotDraft = {
  label: string;
  artistType: ArtistNeedType;
  genres: string;
  status: ArtistNeedStatus;
};

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

function slotTitle(slot: SlotRow) {
  return slot.label.trim() || TYPE_LABELS[slot.artistType];
}

const TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  no_preference: "No preference",
};

function toDraft(slot: SlotRow): SlotDraft {
  return {
    label: slot.label,
    artistType: slot.artistType,
    genres: slot.genres,
    status: slot.status,
  };
}

function draftsEqual(a: SlotDraft, b: SlotDraft) {
  return (
    a.label === b.label &&
    a.artistType === b.artistType &&
    a.genres === b.genres &&
    a.status === b.status
  );
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
  const upsertSlot = useMutation(api.eventArtistNeeds.upsertSlot);
  const removeSlot = useMutation(api.eventArtistNeeds.removeSlot);
  const dismiss = useMutation(api.eventArtistNeeds.dismissInquiry);

  const [drafts, setDrafts] = useState<Record<string, SlotDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // Track the server revision each draft was seeded from so background changes
  // (an inquiry flipping a slot to inquiring) refresh the form.
  const seededRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const slot of data.slots) {
        const revision = `${slot.needId}:${slot.status}:${slot.artistType}:${slot.label}:${slot.genres}`;
        if (seededRef.current.get(slot.needId) === revision) continue;
        seededRef.current.set(slot.needId, revision);
        next[slot.needId] = toDraft(slot);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [data]);

  function patchDraft(needId: string, values: Partial<SlotDraft>) {
    setDrafts((prev) => {
      const current = prev[needId];
      if (!current) return prev;
      return { ...prev, [needId]: { ...current, ...values } };
    });
  }

  async function handleAddSlot() {
    setBusyId("new");
    try {
      await upsertSlot({
        eventId,
        artistType: "no_preference",
        status: "open",
      });
      notify.success("Slot added.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(needId: string) {
    const draft = drafts[needId];
    if (!draft) return;
    setBusyId(needId);
    try {
      await upsertSlot({
        eventId,
        needId: needId as Id<"eventArtistNeeds">,
        label: draft.label.trim() || undefined,
        artistType: draft.artistType,
        genres: draft.genres.trim() || undefined,
        status: draft.status,
      });
      notify.success("Slot saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(slot: SlotRow) {
    const ok = await confirm({
      title: `Remove ${slotTitle(slot)} slot?`,
      description: "This clears the request and any artist inquiries on it.",
      destructive: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusyId(slot.needId);
    try {
      await removeSlot({ needId: slot.needId });
      seededRef.current.delete(slot.needId);
      notify.success("Slot removed.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyId(null);
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

  const slots = data?.slots ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Artist Needed</CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busyId === "new"}
          onClick={() => void handleAddSlot()}
        >
          Add slot
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open slots. Add one per act you are looking for.
          </p>
        ) : (
          slots.map((slot) => {
            const server = toDraft(slot);
            const draft = drafts[slot.needId] ?? server;
            const dirty = !draftsEqual(draft, server);
            return (
              <div
                key={slot.needId}
                className="space-y-3 rounded-md border p-3"
                data-testid="artist-need-slot"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{slotTitle(slot)}</p>
                  <span
                    data-testid="artist-need-status"
                    className={`rounded-md px-2 py-1 text-xs font-medium ${effectiveStatusClass(slot.effectiveStatus)}`}
                  >
                    {effectiveStatusLabel(slot.effectiveStatus)}
                  </span>
                </div>

                <div className="grid gap-2 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Slot name</Label>
                    <Input
                      value={draft.label}
                      onChange={(event) => patchDraft(slot.needId, { label: event.target.value })}
                      placeholder="Headliner"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Looking for</Label>
                    <SearchableSelect
                      value={draft.artistType}
                      onChange={(value) =>
                        patchDraft(slot.needId, { artistType: value as ArtistNeedType })
                      }
                      options={TYPE_OPTIONS}
                      placeholder="Select type"
                      emptyLabel="Select type"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Genres / vibes</Label>
                    <Input
                      value={draft.genres}
                      onChange={(event) => patchDraft(slot.needId, { genres: event.target.value })}
                      placeholder="e.g. indie, jazz, house"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <SearchableSelect
                      value={draft.status}
                      onChange={(value) =>
                        patchDraft(slot.needId, { status: value as ArtistNeedStatus })
                      }
                      options={STATUS_OPTIONS}
                      placeholder="Select status"
                      emptyLabel="Select status"
                    />
                  </div>
                </div>

                {slot.bookedBy.length > 0 ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Booked: </span>
                    {slot.bookedBy.map((artist) => artist.name).join(", ")}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {dirty ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === slot.needId}
                      onClick={() => void handleSave(slot.needId)}
                    >
                      {busyId === slot.needId ? "Saving…" : "Save slot"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === slot.needId}
                    onClick={() => void handleRemove(slot)}
                  >
                    Remove
                  </Button>
                </div>

                {slot.inquiries.length > 0 ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">Inquiries</p>
                    <ul className="space-y-2">
                      {slot.inquiries.map((inquiry) => (
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
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {inquiry.message}
                              </p>
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
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
