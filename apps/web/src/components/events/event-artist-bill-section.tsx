"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArtistSelect, artistSelectOptions } from "@/components/bands/artist-select";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { formatUsd } from "@/lib/format";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";
import { resolvePayoutDefaults } from "@/lib/band-payout-defaults";
import { eventBandOnboardingInviteSchema, eventBandPayoutFieldsSchema } from "@/lib/validations/bands";

type PricingMode = "per_member_hourly" | "fixed_total";
type ParticipationRole = "headliner" | "support" | "other";
type ArtistNeedType = "band" | "dj" | "no_preference";
type ArtistNeedStatus = "open" | "inquiring";
type EffectiveArtistNeedStatus = ArtistNeedStatus | "booked";

type BillData = NonNullable<ReturnType<typeof useQuery<typeof api.eventArtistNeeds.getForEvent>>>;
type SlotRow = BillData["slots"][number];

type PerformerRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventBands.listPerformersForEvent>>
>[number];

type PaymentFields = NonNullable<PerformerRow["payment"]>;

const TYPE_OPTIONS = [
  { value: "band", label: "Live band" },
  { value: "dj", label: "DJ" },
  { value: "no_preference", label: "No preference" },
];

const SLOT_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "inquiring", label: "Inquiring" },
];

const TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  no_preference: "No preference",
};

function effectiveStatusLabel(status: EffectiveArtistNeedStatus) {
  if (status === "booked") return "Booked";
  if (status === "inquiring") return "Inquiring";
  return "Open";
}

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

function slotTitle(slot: { label: string; artistType: ArtistNeedType }) {
  return slot.label.trim() || TYPE_LABELS[slot.artistType];
}

type SlotDraft = {
  label: string;
  artistType: ArtistNeedType;
  genres: string;
  status: ArtistNeedStatus;
};

/** One card on the bill: a position, with the act that fills it if any. */
type BillRow = {
  key: string;
  slot?: SlotRow;
  performer?: PerformerRow;
};

type LineupDraft = {
  setStart: string;
  setEnd: string;
  soundcheckStart: string;
  soundcheckEnd: string;
};

const UNSET = "";

function toSlotDraft(slot: SlotRow): SlotDraft {
  return {
    label: slot.label,
    artistType: slot.artistType,
    genres: slot.genres,
    status: slot.status,
  };
}

function toLineupDraft(performer: PerformerRow): LineupDraft {
  return {
    setStart: performer.setStartsAt != null ? toLocalDateTimeInput(performer.setStartsAt) : UNSET,
    setEnd: performer.setEndsAt != null ? toLocalDateTimeInput(performer.setEndsAt) : UNSET,
    soundcheckStart:
      performer.soundcheckStartsAt != null
        ? toLocalDateTimeInput(performer.soundcheckStartsAt)
        : UNSET,
    soundcheckEnd:
      performer.soundcheckEndsAt != null
        ? toLocalDateTimeInput(performer.soundcheckEndsAt)
        : UNSET,
  };
}

function slotDraftsEqual(a: SlotDraft, b: SlotDraft) {
  return (
    a.label === b.label &&
    a.artistType === b.artistType &&
    a.genres === b.genres &&
    a.status === b.status
  );
}

function lineupDraftsEqual(a: LineupDraft, b: LineupDraft) {
  return (
    a.setStart === b.setStart &&
    a.setEnd === b.setEnd &&
    a.soundcheckStart === b.soundcheckStart &&
    a.soundcheckEnd === b.soundcheckEnd
  );
}

/** Optional instant; an empty field means "not set". */
function toMs(value: string) {
  if (!value.trim()) return null;
  return localDateTimeInputToMs(value);
}

type BandCatalogRow = {
  organizationId: string;
  name?: string;
  displayName?: string;
  performerHourlyRateUsd?: number;
  memberCount?: number;
  bandMembers?: string[];
};

type InvoiceArtistSuggestion = {
  organizationId: string;
  label: string;
  rateUsd?: number;
  performanceHours?: number;
  memberCount?: number;
};

const PRICING_OPTIONS = [
  { value: "per_member_hourly", label: "Per member per hour" },
  { value: "fixed_total", label: "Fixed total" },
];

const ROLE_OPTIONS = [
  { value: "headliner", label: "Headliner" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

function roleLabel(role: ParticipationRole) {
  return ROLE_OPTIONS.find((row) => row.value === role)?.label ?? role;
}

function bandProfileDefaults(bands: BandCatalogRow[] | undefined, organizationId: string) {
  const band = bands?.find((row) => row.organizationId === organizationId);
  if (!band) return null;
  const memberCount =
    typeof band.memberCount === "number" && band.memberCount > 0
      ? band.memberCount
      : (band.bandMembers?.length ?? 0);
  return {
    organizationId,
    performerHourlyRateUsd: band.performerHourlyRateUsd ?? 0,
    memberCount,
  };
}

function applyPayoutDefaultsForOrg(
  bands: BandCatalogRow[] | undefined,
  organizationId: string,
  invoiceLine?: InvoiceArtistSuggestion | null,
) {
  return resolvePayoutDefaults({
    invoiceLine: invoiceLine
      ? {
          organizationId: invoiceLine.organizationId,
          rateUsd: invoiceLine.rateUsd,
          performanceHours: invoiceLine.performanceHours,
          memberCount: invoiceLine.memberCount,
        }
      : null,
    bandProfile: bandProfileDefaults(bands, organizationId),
  });
}

export function EventArtistBillSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventArtistBillPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventArtistBillPanel({ eventId }: { eventId: Id<"events"> }) {
  const performers = useQuery(api.eventBands.listPerformersForEvent, { eventId });
  const eventDetail = useQuery(api.events.get, { id: eventId });
  const invoiceId = eventDetail?.event.invoiceId ?? eventDetail?.series?.invoiceId;
  const invoiceDetail = useQuery(
    api.invoices.get,
    invoiceId ? { id: invoiceId } : "skip",
  );
  const artistDayScope = useQuery(
    api.invoices.getArtistLineDayScope,
    invoiceId ? { invoiceId } : "skip",
  );
  const removeParticipation = useMutation(api.eventBands.removeParticipation);
  const updateRole = useMutation(api.eventBands.updateParticipationRole);
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const bill = useQuery(api.eventArtistNeeds.getForEvent, { eventId });
  const upsertSlot = useMutation(api.eventArtistNeeds.upsertSlot);
  const removeSlot = useMutation(api.eventArtistNeeds.removeSlot);
  const dismissInquiry = useMutation(api.eventArtistNeeds.dismissInquiry);
  const updateLineup = useMutation(api.eventBands.updateParticipationLineup);
  const reorderSlots = useMutation(api.eventArtistNeeds.reorderSlots);
  const { confirm } = useAppDialog();
  const [editingPaymentForOrg, setEditingPaymentForOrg] = useState<string | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>({});
  const [lineupDrafts, setLineupDrafts] = useState<Record<string, LineupDraft>>({});
  const [placementNames, setPlacementNames] = useState<Record<string, string>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);
  const [savingLineupId, setSavingLineupId] = useState<string | null>(null);
  const [addingSlot, setAddingSlot] = useState(false);
  const [addingBand, setAddingBand] = useState(false);
  const [addBandMode, setAddBandMode] = useState<"existing" | "invite">("existing");
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [dismissedInvoicePrompt, setDismissedInvoicePrompt] = useState(false);

  const assignedOrgIds = useMemo(
    () => new Set((performers ?? []).map((row) => row.organizationId)),
    [performers],
  );

  const invoiceArtistByOrg = useMemo(() => {
    const map = new Map<string, InvoiceArtistSuggestion>();
    for (const line of invoiceDetail?.lineItems ?? []) {
      if (line.section !== "artist") continue;
      // Match loadPublicQuoteView's day scoping: an explicit day wins; an
      // unscoped line belongs to the first linked day, or every day for a series.
      if (line.eventId) {
        if (line.eventId !== eventId) continue;
      } else if (
        !(artistDayScope?.isSeriesBooking || artistDayScope?.firstEventId === eventId)
      ) {
        continue;
      }
      const organizationId = line.organizationId?.trim();
      if (!organizationId || map.has(organizationId)) continue;
      map.set(organizationId, {
        organizationId,
        label: line.label?.trim() || "Artist",
        rateUsd: line.rateUsd,
        performanceHours: line.performanceHours,
        memberCount: line.memberCount,
      });
    }
    return map;
  }, [invoiceDetail?.lineItems, eventId, artistDayScope]);

  const invoiceArtistSuggestions = useMemo(
    () =>
      [...invoiceArtistByOrg.values()].filter((row) => !assignedOrgIds.has(row.organizationId)),
    [invoiceArtistByOrg, assignedOrgIds],
  );

  const showInvoiceEmptyPrompt =
    !dismissedInvoicePrompt &&
    performers !== undefined &&
    performers.length === 0 &&
    invoiceArtistSuggestions.length > 0;

  const totalBandsCost = useMemo(
    () =>
      (performers ?? []).reduce((sum, row) => sum + (row.payment?.totalUsd ?? 0), 0),
    [performers],
  );

  async function onRemove(organizationId: string) {
    setBusyOrgId(organizationId);
    try {
      await removeParticipation({ eventId, organizationId });
      if (editingPaymentForOrg === organizationId) setEditingPaymentForOrg(null);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyOrgId(null);
    }
  }

  async function onRoleChange(organizationId: string, role: ParticipationRole) {
    setBusyOrgId(organizationId);
    try {
      await updateRole({ eventId, organizationId, role });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyOrgId(null);
    }
  }

  async function onImportFromInvoice() {
    if (invoiceArtistSuggestions.length === 0) return;
    setImportBusy(true);
    try {
      for (const suggestion of invoiceArtistSuggestions) {
        await addParticipation({
          eventId,
          organizationId: suggestion.organizationId,
          role: "headliner",
        });
      }
      notify.success(
        invoiceArtistSuggestions.length === 1
          ? "Imported artist from invoice — confirm payout details."
          : `Imported ${invoiceArtistSuggestions.length} artists from invoice — confirm payout details.`,
      );
      setEditingPaymentForOrg(invoiceArtistSuggestions[0]?.organizationId ?? null);
      setDismissedInvoicePrompt(true);
      setAddingBand(false);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setImportBusy(false);
    }
  }

  /** One card per position, in bill order; acts nobody placed trail at the end. */
  const rows = useMemo(() => {
    const byParticipation = new Map<string, PerformerRow>();
    for (const row of performers ?? []) byParticipation.set(row.participationId, row);
    const placed = new Set<string>();
    const list: BillRow[] = (bill?.slots ?? []).map((slot) => {
      const performer = slot.filledBy[0]
        ? byParticipation.get(slot.filledBy[0].participationId)
        : undefined;
      if (performer) placed.add(performer.participationId);
      return { key: `slot-${slot.needId}`, slot, performer };
    });
    for (const performer of performers ?? []) {
      if (placed.has(performer.participationId)) continue;
      list.push({ key: `act-${performer.participationId}`, performer });
    }
    return list;
  }, [bill?.slots, performers]);

  function patchSlotDraft(needId: string, values: Partial<SlotDraft>) {
    setSlotDrafts((prev) => {
      const server = bill?.slots.find((slot) => slot.needId === needId);
      const current = prev[needId] ?? (server ? toSlotDraft(server) : undefined);
      if (!current) return prev;
      return { ...prev, [needId]: { ...current, ...values } };
    });
  }

  function patchLineupDraft(participationId: string, values: Partial<LineupDraft>) {
    setLineupDrafts((prev) => {
      const server = performers?.find((row) => row.participationId === participationId);
      const current = prev[participationId] ?? (server ? toLineupDraft(server) : undefined);
      if (!current) return prev;
      return { ...prev, [participationId]: { ...current, ...values } };
    });
  }

  async function onAddSlot() {
    setAddingSlot(true);
    try {
      await upsertSlot({ eventId, artistType: "no_preference", status: "open" });
      notify.success("Position added.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setAddingSlot(false);
    }
  }

  async function onSaveSlot(slot: SlotRow) {
    const draft = slotDrafts[slot.needId] ?? toSlotDraft(slot);
    setSavingSlotId(slot.needId);
    try {
      await upsertSlot({
        eventId,
        needId: slot.needId,
        label: draft.label.trim() || undefined,
        artistType: draft.artistType,
        genres: draft.genres.trim() || undefined,
        status: draft.status,
      });
      notify.success("Position saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSavingSlotId(null);
    }
  }

  async function onRemoveSlot(slot: SlotRow) {
    const ok = await confirm({
      title: `Remove the ${slotTitle(slot)} position?`,
      description: "This clears the request and any artist inquiries on it.",
      destructive: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setSavingSlotId(slot.needId);
    try {
      await removeSlot({ needId: slot.needId });
      setSlotDrafts((prev) => {
        const next = { ...prev };
        delete next[slot.needId];
        return next;
      });
      notify.success("Position removed.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSavingSlotId(null);
    }
  }

  async function onSaveLineup(performer: PerformerRow, needId: Id<"eventArtistNeeds"> | null) {
    const draft = lineupDrafts[performer.participationId] ?? toLineupDraft(performer);
    setSavingLineupId(performer.participationId);
    try {
      await updateLineup({
        participationId: performer.participationId,
        needId,
        setStartsAt: toMs(draft.setStart),
        setEndsAt: toMs(draft.setEnd),
        soundcheckStartsAt: toMs(draft.soundcheckStart),
        soundcheckEndsAt: toMs(draft.soundcheckEnd),
      });
      notify.success("Lineup updated.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSavingLineupId(null);
    }
  }

  async function onDismissInquiry(inquiryId: Id<"eventArtistInquiries">) {
    try {
      await dismissInquiry({ inquiryId });
      notify.success("Inquiry dismissed.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  function handleDrop(targetKey: string) {
    const from = rows.findIndex((row) => row.key === dragKey);
    const to = rows.findIndex((row) => row.key === targetKey);
    setDragKey(null);
    if (!dragKey || from < 0 || to < 0 || from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    void (async () => {
      try {
        await reorderSlots({
          eventId,
          needIds: next.flatMap((row) => (row.slot ? [row.slot.needId] : [])),
        });
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
      }
    })();
  }

  /** Give a stray act a named place on the bill. */
  async function onPlaceAct(performer: PerformerRow) {
    const name = (placementNames[performer.participationId] ?? "").trim();
    if (!name) {
      notify.error("Name this position.");
      return;
    }
    setSavingLineupId(performer.participationId);
    try {
      const { needId } = await upsertSlot({
        eventId,
        label: name,
        artistType: "no_preference",
        status: "open",
      });
      await updateLineup({
        participationId: performer.participationId,
        needId,
        setStartsAt: performer.setStartsAt ?? null,
        setEndsAt: performer.setEndsAt ?? null,
        soundcheckStartsAt: performer.soundcheckStartsAt ?? null,
        soundcheckEndsAt: performer.soundcheckEndsAt ?? null,
      });
      notify.success("Added to the bill.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSavingLineupId(null);
    }
  }

  if (performers === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading artists…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Lineup</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            The bill — each position is either filled or still needed. Set the slot, when they
            play, and the payout on the same row; removing an act also cancels any unpaid payout
            and media access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {totalBandsCost > 0 ? (
            <p className="text-sm">
              <span className="font-medium">Payout total:</span> {formatUsd(totalBandsCost)}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={addingSlot}
            onClick={() => void onAddSlot()}
          >
            Add position
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showInvoiceEmptyPrompt ? (
          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <p className="text-sm font-medium">
              Invoice lists {invoiceArtistSuggestions.length} artist
              {invoiceArtistSuggestions.length === 1 ? "" : "s"}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {invoiceArtistSuggestions.map((row) => (
                <li key={row.organizationId}>{row.label}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={importBusy}
                onClick={() => void onImportFromInvoice()}
              >
                {importBusy ? "Importing…" : "Accept and confirm money"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={importBusy}
                onClick={() => setDismissedInvoicePrompt(true)}
              >
                Not now
              </Button>
            </div>
          </div>
        ) : null}

        {rows.length === 0 && !showInvoiceEmptyPrompt ? (
          <p className="text-sm text-muted-foreground">
            No positions on the bill yet. Add one per act you are looking for.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <div
            className="flex flex-col gap-2"
            onDragEnd={() => setDragKey(null)}
          >
            {rows.map((row) => {
              const { slot, performer } = row;
              const serverSlot = slot ? toSlotDraft(slot) : null;
              const slotDraft = slot ? (slotDrafts[slot.needId] ?? serverSlot) : null;
              const slotDirty = Boolean(
                slot && serverSlot && slotDraft && !slotDraftsEqual(slotDraft, serverSlot),
              );
              const serverLineup = performer ? toLineupDraft(performer) : null;
              const lineupDraft = performer
                ? (lineupDrafts[performer.participationId] ?? serverLineup)
                : null;
              const lineupDirty = Boolean(
                performer &&
                  serverLineup &&
                  lineupDraft &&
                  !lineupDraftsEqual(lineupDraft, serverLineup),
              );
              const placed = Boolean(slot && performer);
              return (
                <div
                  key={row.key}
                  data-testid="bill-card"
                  draggable
                  onDragStart={() => setDragKey(row.key)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(row.key)}
                  className={`cursor-grab space-y-3 rounded-md border px-3 py-3 text-sm active:cursor-grabbing ${
                    dragKey === row.key ? "opacity-50" : ""
                  } ${slot && !performer ? "border-dashed" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {slot && slotDraft ? (
                      <Input
                        className="h-8 max-w-56 font-medium"
                        value={slotDraft.label}
                        placeholder="Name this position"
                        onChange={(event) =>
                          patchSlotDraft(slot.needId, { label: event.target.value })
                        }
                        onBlur={() => {
                          if (slotDirty) void onSaveSlot(slot);
                        }}
                      />
                    ) : (
                      <p className="font-medium">{performer?.bandName ?? ""}</p>
                    )}
                    <span
                      data-testid="artist-need-status"
                      className={`rounded-md px-2 py-1 text-xs font-medium ${effectiveStatusClass(
                        slot ? slot.effectiveStatus : "booked",
                      )}`}
                    >
                      {effectiveStatusLabel(slot ? slot.effectiveStatus : "booked")}
                    </span>
                  </div>

                  {performer ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <SearchableSelect
                          value={performer.role}
                          onChange={(value) =>
                            void onRoleChange(performer.organizationId, value as ParticipationRole)
                          }
                          options={ROLE_OPTIONS}
                          placeholder="Role"
                          emptyLabel="Role"
                        />
                        {performer.payment ? (
                          <p className="text-muted-foreground">
                            {formatUsd(performer.payment.totalUsd)} ·{" "}
                            {performer.payment.statusLabel}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">No payout set</p>
                        )}
                        {performer.awaitingOnboarding ? (
                          <p className="text-status-amber-700 dark:text-status-amber-300">
                            Onboarding pending
                          </p>
                        ) : null}
                      </div>

                      {lineupDraft ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Set</Label>
                            <DateTimeRangePicker
                              startValue={lineupDraft.setStart}
                              endValue={lineupDraft.setEnd}
                              onChange={(next) =>
                                patchLineupDraft(performer.participationId, {
                                  setStart: next.start,
                                  setEnd: next.end,
                                })
                              }
                              placeholder="When they play"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Soundcheck</Label>
                            <DateTimeRangePicker
                              startValue={lineupDraft.soundcheckStart}
                              endValue={lineupDraft.soundcheckEnd}
                              onChange={(next) =>
                                patchLineupDraft(performer.participationId, {
                                  soundcheckStart: next.start,
                                  soundcheckEnd: next.end,
                                })
                              }
                              placeholder="When to arrive"
                            />
                          </div>
                        </div>
                      ) : null}

                      {performer.payment ? (
                        <p className="text-xs text-muted-foreground">
                          Payment ID: {performer.payment.confirmationToken}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        {!placed ? (
                          <>
                            <Input
                              className="h-8 w-48"
                              placeholder="Name this position"
                              value={placementNames[performer.participationId] ?? ""}
                              onChange={(event) =>
                                setPlacementNames((prev) => ({
                                  ...prev,
                                  [performer.participationId]: event.target.value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingLineupId === performer.participationId}
                              onClick={() => void onPlaceAct(performer)}
                            >
                              Add to bill
                            </Button>
                          </>
                        ) : null}
                        {performer.payment?.status !== "paid" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                editingPaymentForOrg === performer.organizationId
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() =>
                                setEditingPaymentForOrg(
                                  editingPaymentForOrg === performer.organizationId
                                    ? null
                                    : performer.organizationId,
                                )
                              }
                            >
                              {editingPaymentForOrg === performer.organizationId
                                ? "Close"
                                : performer.payment
                                  ? "Edit payout"
                                  : "Add payout"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyOrgId === performer.organizationId}
                              onClick={() => void onRemove(performer.organizationId)}
                            >
                              Remove
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {roleLabel(performer.role)} · Paid
                          </span>
                        )}
                        {lineupDirty ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingLineupId === performer.participationId}
                            onClick={() =>
                              void onSaveLineup(performer, slot?.needId ?? null)
                            }
                          >
                            {savingLineupId === performer.participationId ? "Saving…" : "Save"}
                          </Button>
                        ) : null}
                      </div>

                      {editingPaymentForOrg === performer.organizationId ? (
                        <EventBandPaymentForm
                          key={`${performer.organizationId}-payment`}
                          eventId={eventId}
                          organizationId={performer.organizationId}
                          role={performer.role}
                          payment={performer.payment}
                          organizationLocked
                          excludedOrganizationIds={[]}
                          invoiceLine={invoiceArtistByOrg.get(performer.organizationId) ?? null}
                          invoiceDefaultsReady={
                            !invoiceId ||
                            (invoiceDetail !== undefined && artistDayScope !== undefined)
                          }
                          onSaved={() => setEditingPaymentForOrg(null)}
                          onCancel={() => setEditingPaymentForOrg(null)}
                        />
                      ) : null}
                    </>
                  ) : slot && slotDraft ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label>Looking for</Label>
                          <SearchableSelect
                            value={slotDraft.artistType}
                            onChange={(value) =>
                              patchSlotDraft(slot.needId, {
                                artistType: value as ArtistNeedType,
                              })
                            }
                            options={TYPE_OPTIONS}
                            placeholder="Select type"
                            emptyLabel="Select type"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Genres / vibes</Label>
                          <Input
                            value={slotDraft.genres}
                            onChange={(event) =>
                              patchSlotDraft(slot.needId, { genres: event.target.value })
                            }
                            placeholder="e.g. indie, jazz, house"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Status</Label>
                          <SearchableSelect
                            value={slotDraft.status}
                            onChange={(value) =>
                              patchSlotDraft(slot.needId, { status: value as ArtistNeedStatus })
                            }
                            options={SLOT_STATUS_OPTIONS}
                            placeholder="Select status"
                            emptyLabel="Select status"
                          />
                        </div>
                      </div>

                      {slot.inquiries.length > 0 ? (
                        <div className="space-y-2 border-t pt-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Inquiries
                          </p>
                          <ul className="space-y-2">
                            {slot.inquiries.map((inquiry) => (
                              <li
                                key={inquiry._id}
                                className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {inquiry.name}
                                    {inquiry.status === "dismissed" ? (
                                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        Dismissed
                                      </span>
                                    ) : null}
                                  </p>
                                  {inquiry.message ? (
                                    <p className="mt-0.5 text-muted-foreground">
                                      {inquiry.message}
                                    </p>
                                  ) : null}
                                </div>
                                {inquiry.status === "submitted" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void onDismissInquiry(inquiry._id)}
                                  >
                                    Dismiss
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {slotDirty ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingSlotId === slot.needId}
                            onClick={() => void onSaveSlot(slot)}
                          >
                            {savingSlotId === slot.needId ? "Saving…" : "Save position"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={savingSlotId === slot.needId}
                          onClick={() => void onRemoveSlot(slot)}
                        >
                          Remove
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {addingBand ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={addBandMode === "existing" ? "default" : "outline"}
                onClick={() => setAddBandMode("existing")}
              >
                Existing artist
              </Button>
              <Button
                type="button"
                size="sm"
                variant={addBandMode === "invite" ? "default" : "outline"}
                onClick={() => setAddBandMode("invite")}
              >
                Invite new artist
              </Button>
            </div>
            {addBandMode === "invite" ? (
              <InviteBandForm
                eventId={eventId}
                onSaved={() => setAddingBand(false)}
                onCancel={() => setAddingBand(false)}
              />
            ) : (
              <AddBandForm
                eventId={eventId}
                excludedOrganizationIds={performers.map((row) => row.organizationId)}
                onSaved={() => setAddingBand(false)}
                onCancel={() => setAddingBand(false)}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => {
              setAddBandMode("existing");
              setAddingBand(true);
            }}>
              Add artist
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAddBandMode("invite");
                setAddingBand(true);
              }}
            >
              Invite new artist
            </Button>
            {invoiceArtistSuggestions.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={importBusy}
                onClick={() => void onImportFromInvoice()}
              >
                Import from invoice ({invoiceArtistSuggestions.length})
              </Button>
            ) : null}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function InviteBandForm({
  eventId,
  needId,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  /** Position to fill, when this was started from an open slot. */
  needId?: Id<"eventArtistNeeds">;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const inviteBand = useMutation(api.eventBands.inviteBandFromEvent);
  const [email, setEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [pricingMode, setPricingMode] = useState<PricingMode>("per_member_hourly");
  const [ratePerMemberPerHourUsd, setRatePerMemberPerHourUsd] = useState("150");
  const [performanceHours, setPerformanceHours] = useState("1");
  const [memberCount, setMemberCount] = useState("4");
  const [fixedTotalUsd, setFixedTotalUsd] = useState("0");
  const [busy, setBusy] = useState(false);

  const computedTotal = useMemo(() => {
    if (pricingMode === "fixed_total") return Number(fixedTotalUsd || "0");
    return (
      Number(ratePerMemberPerHourUsd || "0") *
      Number(performanceHours || "0") *
      Number(memberCount || "0")
    );
  }, [pricingMode, ratePerMemberPerHourUsd, performanceHours, memberCount, fixedTotalUsd]);

  async function onSubmit() {
    const parsed = eventBandOnboardingInviteSchema.safeParse({
      email,
      artistName,
      role,
      pricingMode,
      ratePerMemberPerHourUsd,
      performanceHours,
      memberCount,
      fixedTotalUsd,
    });
    if (!parsed.success) {
      notify.error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await inviteBand({
        eventId,
        needId,
        email: parsed.data.email,
        artistName: parsed.data.artistName,
        role: parsed.data.role,
        pricingMode: parsed.data.pricingMode,
        ratePerMemberPerHourUsd:
          parsed.data.pricingMode === "per_member_hourly"
            ? parsed.data.ratePerMemberPerHourUsd
            : undefined,
        performanceHours: parsed.data.performanceHours,
        memberCount:
          parsed.data.pricingMode === "per_member_hourly" ? parsed.data.memberCount : undefined,
        totalUsd:
          parsed.data.pricingMode === "fixed_total" ? parsed.data.fixedTotalUsd : computedTotal,
      });
      notify.success(`Invite sent to ${parsed.data.email}.`);
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">Invite new artist</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="invite-band-artist-name">Artist name</Label>
          <Input
            id="invite-band-artist-name"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder="The Redwoods"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="invite-band-email">Contact email</Label>
          <Input
            id="invite-band-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="artist@stanford.edu"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <SearchableSelect
            value={role}
            onChange={(value) => setRole(value as ParticipationRole)}
            options={ROLE_OPTIONS}
            placeholder="Role"
            emptyLabel="Role"
          />
        </div>
        <div className="space-y-1">
          <Label>Pricing mode</Label>
          <SearchableSelect
            value={pricingMode}
            onChange={(value) => setPricingMode(value as PricingMode)}
            options={PRICING_OPTIONS}
            placeholder="Pricing mode"
            emptyLabel="Select pricing mode"
          />
        </div>
        <div className="space-y-1">
          <Label>Performance length (hours)</Label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={performanceHours}
            onChange={(e) => setPerformanceHours(e.target.value)}
          />
        </div>
        {pricingMode === "per_member_hourly" ? (
          <>
            <div className="space-y-1">
              <Label>Rate per member per hour (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={ratePerMemberPerHourUsd}
                onChange={(e) => setRatePerMemberPerHourUsd(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Member count</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label>Total payout (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={fixedTotalUsd}
              onChange={(e) => setFixedTotalUsd(e.target.value)}
            />
          </div>
        )}
        <div className="rounded-md border px-3 py-2 text-sm md:col-span-2">
          <span className="font-medium">Computed total:</span> {formatUsd(computedTotal)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSubmit()} disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AddBandForm({
  eventId,
  needId,
  excludedOrganizationIds,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  /** Position to fill, when this was started from an open slot. */
  needId?: Id<"eventArtistNeeds">;
  excludedOrganizationIds: string[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [busy, setBusy] = useState(false);

  const bandOptions = useMemo(
    () => artistSelectOptions(bands, { excludeOrganizationIds: excludedOrganizationIds }),
    [bands, excludedOrganizationIds],
  );

  async function onSave() {
    if (!organizationId) {
      notify.error("Select an artist.");
      return;
    }
    setBusy(true);
    try {
      await addParticipation({ eventId, organizationId, role, needId });
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">Add artist</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Artist</Label>
          <ArtistSelect
            value={organizationId}
            onChange={setOrganizationId}
            options={bandOptions}
            placeholder="Search artists…"
            emptyLabel="Select artist"
          />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <SearchableSelect
            value={role}
            onChange={(value) => setRole(value as ParticipationRole)}
            options={ROLE_OPTIONS}
            placeholder="Role"
            emptyLabel="Role"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={busy}>
          {busy ? "Adding…" : "Assign artist"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EventBandPaymentForm({
  eventId,
  organizationId: lockedOrganizationId,
  role,
  payment,
  organizationLocked,
  excludedOrganizationIds,
  invoiceLine = null,
  invoiceDefaultsReady = true,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  organizationId?: string;
  role: ParticipationRole;
  payment: PaymentFields | null;
  organizationLocked?: boolean;
  excludedOrganizationIds: string[];
  invoiceLine?: InvoiceArtistSuggestion | null;
  /** False while the event invoice query is still loading (so invoice line defaults win). */
  invoiceDefaultsReady?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const upsert = useMutation(api.bandPayments.upsertForEvent);

  const [organizationId, setOrganizationId] = useState(lockedOrganizationId ?? "");
  const resolvedOrgId = organizationLocked
    ? (lockedOrganizationId ?? "")
    : organizationId;

  const orgPayee = useQuery(
    api.bandPayments.getBandPayeeForOrganization,
    resolvedOrgId ? { organizationId: resolvedOrgId } : "skip",
  );

  const seedDefaults = applyPayoutDefaultsForOrg(
    bands as BandCatalogRow[] | undefined,
    lockedOrganizationId ?? "",
    invoiceLine,
  );

  const [pricingMode, setPricingMode] = useState<PricingMode>(
    payment?.pricingMode ?? seedDefaults.pricingMode,
  );
  const [ratePerMemberPerHourUsd, setRatePerMemberPerHourUsd] = useState(
    payment
      ? String(payment.ratePerMemberPerHourUsd ?? 0)
      : seedDefaults.ratePerMemberPerHourUsd,
  );
  const [performanceHours, setPerformanceHours] = useState(
    String(payment?.performanceHours ?? seedDefaults.performanceHours),
  );
  const [memberCount, setMemberCount] = useState(
    String(payment?.memberCount ?? seedDefaults.memberCount),
  );
  const [fixedTotalUsd, setFixedTotalUsd] = useState(String(payment?.totalUsd ?? 0));
  const [busy, setBusy] = useState(false);
  const [defaultsReadyForOrg, setDefaultsReadyForOrg] = useState(
    Boolean(payment) || !lockedOrganizationId,
  );

  if (payment === null && bands && resolvedOrgId && !defaultsReadyForOrg && invoiceDefaultsReady) {
    const next = applyPayoutDefaultsForOrg(
      bands as BandCatalogRow[] | undefined,
      resolvedOrgId,
      invoiceLine,
    );
    setPricingMode(next.pricingMode);
    setRatePerMemberPerHourUsd(next.ratePerMemberPerHourUsd);
    setPerformanceHours(next.performanceHours);
    setMemberCount(next.memberCount);
    setDefaultsReadyForOrg(true);
  }

  const bandOptions = useMemo(
    () => artistSelectOptions(bands, { excludeOrganizationIds: excludedOrganizationIds }),
    [bands, excludedOrganizationIds],
  );

  const computedTotal = useMemo(() => {
    if (pricingMode === "fixed_total") return Number(fixedTotalUsd || "0");
    return (
      Number(ratePerMemberPerHourUsd || "0") *
      Number(performanceHours || "0") *
      Number(memberCount || "0")
    );
  }, [pricingMode, ratePerMemberPerHourUsd, performanceHours, memberCount, fixedTotalUsd]);

  const payeeComplete = orgPayee?.payeeComplete ?? payment?.payeeComplete ?? false;

  async function onSave() {
    if (!resolvedOrgId) {
      notify.error("Select an artist.");
      return;
    }
    const payoutParsed = eventBandPayoutFieldsSchema.safeParse({
      pricingMode,
      ratePerMemberPerHourUsd,
      performanceHours,
      memberCount,
      fixedTotalUsd,
    });
    if (!payoutParsed.success) {
      notify.error(payoutParsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await upsert({
        eventId,
        paymentId: payment?._id,
        organizationId: resolvedOrgId,
        role,
        pricingMode: payoutParsed.data.pricingMode,
        ratePerMemberPerHourUsd:
          payoutParsed.data.pricingMode === "per_member_hourly"
            ? payoutParsed.data.ratePerMemberPerHourUsd
            : undefined,
        performanceHours: payoutParsed.data.performanceHours,
        memberCount:
          payoutParsed.data.pricingMode === "per_member_hourly"
            ? payoutParsed.data.memberCount
            : undefined,
        totalUsd:
          payoutParsed.data.pricingMode === "fixed_total"
            ? payoutParsed.data.fixedTotalUsd
            : computedTotal,
      });
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const displayPayeeName = payment?.designatedPayeeName ?? orgPayee?.designatedPayeeName ?? "";
  const displayPayeeEmail = payment?.designatedPayeeEmail ?? orgPayee?.designatedPayeeEmail ?? "";
  const displayPayeeAddress =
    payment?.designatedPayeeMailingAddress ?? orgPayee?.designatedPayeeMailingAddress ?? "";
  const displayPayoutMethod =
    payment?.designatedPayeePayoutMethod ?? orgPayee?.designatedPayeePayoutMethod;

  return (
    <div className="space-y-4 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">{payment ? "Edit payout" : "Add payout"}</p>

      {payment ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            <span className="font-medium">Status:</span> {payment.statusLabel}
          </p>
          {payment.eventEnded && payment.status === "draft" ? (
            <p className="text-muted-foreground">
              This event has ended and will enter the payout queue on save.
            </p>
          ) : null}
          {payment.status === "pending_onboarding" ? (
            <p className="text-status-amber-700 dark:text-status-amber-300">
              Waiting for the artist to finish onboarding before payout can proceed.
            </p>
          ) : null}
          {payment.status === "pending_payee" && !payeeComplete ? (
            <p className="text-status-amber-700 dark:text-status-amber-300">
              Waiting for the artist to configure their designated payee before confirmation can be
              sent.
            </p>
          ) : null}
          {payment.status === "pending_payee" && payeeComplete ? (
            <p className="text-muted-foreground">
              Payee is on file for this artist. The payout queue will update automatically, or save
              this payment to refresh it now.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {!organizationLocked ? (
          <div className="space-y-1 md:col-span-2">
            <Label>Artist</Label>
            <ArtistSelect
              value={organizationId}
              onChange={(value) => {
                setOrganizationId(value);
                if (!payment) {
                  const next = applyPayoutDefaultsForOrg(
                    bands as BandCatalogRow[] | undefined,
                    value,
                    invoiceLine?.organizationId === value ? invoiceLine : null,
                  );
                  setPricingMode(next.pricingMode);
                  setRatePerMemberPerHourUsd(next.ratePerMemberPerHourUsd);
                  setPerformanceHours(next.performanceHours);
                  setMemberCount(next.memberCount);
                  setDefaultsReadyForOrg(true);
                }
              }}
              options={bandOptions}
              placeholder="Search artists…"
              emptyLabel="Select artist"
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <Label>Pricing mode</Label>
          <SearchableSelect
            value={pricingMode}
            onChange={(value) => setPricingMode(value as PricingMode)}
            options={PRICING_OPTIONS}
            placeholder="Pricing mode"
            emptyLabel="Select pricing mode"
          />
        </div>

        <div className="space-y-1">
          <Label>Performance length (hours)</Label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={performanceHours}
            onChange={(e) => setPerformanceHours(e.target.value)}
            disabled={payment?.status === "paid"}
          />
        </div>

        {pricingMode === "per_member_hourly" ? (
          <>
            <div className="space-y-1">
              <Label>Rate per member per hour (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={ratePerMemberPerHourUsd}
                onChange={(e) => setRatePerMemberPerHourUsd(e.target.value)}
                disabled={payment?.status === "paid"}
              />
            </div>
            <div className="space-y-1">
              <Label>Member count</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
                disabled={payment?.status === "paid"}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label>Total payout (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={fixedTotalUsd}
              onChange={(e) => setFixedTotalUsd(e.target.value)}
              disabled={payment?.status === "paid"}
            />
          </div>
        )}

        <div className="rounded-md border px-3 py-2 text-sm md:col-span-2">
          <span className="font-medium">Computed total:</span> {formatUsd(computedTotal)}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Designated payee (from artist org profile)</Label>
          {resolvedOrgId ? (
            payeeComplete ? (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">Payee:</span> {displayPayeeName} (
                  {displayPayeeEmail})
                </p>
                <p className="mt-1">
                  <span className="font-medium">Payout method:</span>{" "}
                  {formatBandPayeePayoutMethod(displayPayoutMethod)}
                </p>
                {displayPayeeAddress ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {displayPayeeAddress}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-3 text-sm">
                <p className="text-muted-foreground">
                  This artist has not configured a designated payee with mailing address and payout
                  method. Confirmation emails cannot be sent until payee info is on file.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href="/dashboard/artists/payments#payee">
                    Open artist payee settings
                  </Link>
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Select an artist to view payee details.</p>
          )}
        </div>
      </div>


      <div className="flex flex-wrap gap-2">
        {payment?.status !== "paid" ? (
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {payment ? "Save payout" : "Save payout"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
