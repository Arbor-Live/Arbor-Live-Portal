"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CaretRightIcon,
  DotsThreeIcon,
  MicrophoneStageIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDialog } from "@/components/ui/app-dialog";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { AddToBillDialog } from "@/components/events/lineup/add-to-bill-dialog";
import {
  type InvoiceArtistSuggestion,
  type PerformerRow,
} from "@/components/events/lineup/lineup-forms";
import {
  TYPE_LABELS,
  effectiveStatusClass,
  effectiveStatusLabel,
  rowActName,
  rowSetWindow,
  rowStatus,
  slotTitle,
  type BillRow,
  type SlotDraft,
  type SlotRow,
} from "@/components/events/lineup/lineup-model";
import { PositionSheet, type PositionSheetHandlers } from "@/components/events/lineup/position-sheet";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatTime, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export function EventArtistBillSection({
  eventId,
  canEdit = true,
}: {
  eventId: Id<"events">;
  /** Viewers without edit access see the bill but cannot change it. */
  canEdit?: boolean;
}) {
  return (
    <ArborOnlyGuard>
      <fieldset disabled={!canEdit} className="contents">
        <EventArtistBillPanel eventId={eventId} canEdit={canEdit} />
      </fieldset>
    </ArborOnlyGuard>
  );
}

function EventArtistBillPanel({
  eventId,
  canEdit,
}: {
  eventId: Id<"events">;
  canEdit: boolean;
}) {
  const performers = useQuery(api.eventBands.listPerformersForEvent, { eventId });
  const riders = useQuery(api.bandRiders.listForEvent, { eventId });
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
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const bill = useQuery(api.eventArtistNeeds.getForEvent, { eventId });
  const upsertSlot = useMutation(api.eventArtistNeeds.upsertSlot);
  const removeSlot = useMutation(api.eventArtistNeeds.removeSlot);
  const dismissInquiry = useMutation(api.eventArtistNeeds.dismissInquiry);
  const updateSlotLineup = useMutation(api.eventArtistNeeds.updateSlotLineup);
  const { confirm } = useAppDialog();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
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
      setDismissedInvoicePrompt(true);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setImportBusy(false);
    }
  }

  /** One row per position, in bill order; an act without a position trails at the end. */
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
    // Show order: by set time from the Run of Show. Unscheduled rows follow in
    // the order they were added (a stable sort keeps the bill's order).
    return list
      .map((row, index) => ({ row, index, start: rowSetWindow(row)[0] }))
      .sort((a, b) => {
        if (a.start != null && b.start != null) return a.start - b.start || a.index - b.index;
        if (a.start != null) return -1;
        if (b.start != null) return 1;
        return a.index - b.index;
      })
      .map(({ row }) => row);
  }, [bill?.slots, performers]);

  const riderByOrg = useMemo(
    () => new Map((riders ?? []).map((row) => [row.organizationId, row])),
    [riders],
  );

  /** Positions nobody fills yet — what a new act can be booked into. */
  const openPositions = useMemo(
    () =>
      rows.flatMap((row) =>
        row.slot && !rowActName(row) ? [{ value: row.slot.needId, label: slotTitle(row.slot) }] : [],
      ),
    [rows],
  );

  const summary = useMemo(() => {
    const booked = rows.filter((row) => rowActName(row)).length;
    const payments = rows.flatMap((row) => (row.performer?.payment ? [row.performer.payment] : []));
    const total = payments.reduce((sum, payment) => sum + payment.totalUsd, 0);
    const unpaid = payments.filter((payment) => payment.status !== "paid").length;
    return { booked, open: rows.length - booked, total, unpaid };
  }, [rows]);

  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;

  async function attempt(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      notify.success(success);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const handlers: PositionSheetHandlers = {
    saveSlot: (slot: SlotRow, draft: SlotDraft) =>
      attempt(
        () =>
          upsertSlot({
            eventId,
            needId: slot.needId,
            label: draft.label.trim() || undefined,
            artistType: draft.artistType || "no_preference",
            genres: draft.genres.trim() || undefined,
            status: draft.status || "open",
          }),
        "Position saved.",
      ),
    saveExternal: (slot, name) =>
      attempt(
        () => updateSlotLineup({ needId: slot.needId, externalArtistName: name }),
        "Position filled.",
      ),
    reopenExternal: (slot) =>
      attempt(
        () => updateSlotLineup({ needId: slot.needId, externalArtistName: null }),
        "Position reopened.",
      ),
    removeAct: async (performer) => {
      const ok = await confirm({
        title: `Remove ${performer.bandName}?`,
        description:
          "Their position stays open (with its Run of Show times). Any unpaid payout is cancelled and they lose media access.",
        destructive: true,
        confirmLabel: "Remove act",
      });
      if (!ok) return;
      await attempt(
        () => removeParticipation({ eventId, organizationId: performer.organizationId }),
        `${performer.bandName} removed.`,
      );
    },
    removePosition: async (row) => {
      const name = rowActName(row) ?? (row.slot ? slotTitle(row.slot) : "this act");
      const ok = await confirm({
        title: `Remove ${name} from the bill?`,
        description: row.performer
          ? "Removes the act and its position, including its Run of Show times. Any unpaid payout is cancelled."
          : "Removes the position, its Run of Show times, and any artist inquiries on it.",
        destructive: true,
        confirmLabel: "Remove",
      });
      if (!ok) return;
      await attempt(async () => {
        if (row.performer) {
          await removeParticipation({ eventId, organizationId: row.performer.organizationId });
        }
        if (row.slot) await removeSlot({ needId: row.slot.needId });
      }, `${name} removed from the bill.`);
      setSelectedKey(null);
    },
    dismissInquiry: (inquiryId) => attempt(() => dismissInquiry({ inquiryId }), "Inquiry dismissed."),
  };

  if (performers === undefined || bill === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Loading lineup…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <MicrophoneStageIcon className="size-4 text-muted-foreground" />
            Lineup
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            In show order, from set times in the Run of Show. Acts without a set yet come last.
          </p>
          {rows.length > 0 ? (
            <p className="text-sm" data-testid="lineup-summary">
              {rows.length} position{rows.length === 1 ? "" : "s"} · {summary.booked} booked ·{" "}
              {summary.open} open
              {summary.total > 0
                ? ` · ${formatUsd(summary.total)} in payouts${summary.unpaid > 0 ? ` (${summary.unpaid} unpaid)` : ""}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoiceArtistSuggestions.length > 0 && !showInvoiceEmptyPrompt ? (
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
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon className="size-4" />
            Add to bill
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
          <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No one on the bill yet. Add an act, or open a position for artists to ask about.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <ol className="space-y-2">
            {rows.map((row, index) => {
              const status = rowStatus(row);
              const actName = rowActName(row);
              const [setStart, setEnd] = rowSetWindow(row);
              const rider = row.performer ? riderByOrg.get(row.performer.organizationId) : undefined;
              const openInquiries =
                row.slot?.inquiries.filter((inquiry) => inquiry.status === "submitted").length ?? 0;
              return (
                <li
                  key={row.key}
                  data-testid="bill-card"
                  className="flex items-center gap-2 border pr-1 pl-3 text-sm"
                >
                  <span
                    className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
                    title={setStart != null ? "Show order" : "No set time yet"}
                  >
                    {setStart != null ? index + 1 : "–"}
                  </span>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left hover:bg-muted/30"
                    onClick={() => setSelectedKey(row.key)}
                  >
                    <div className="min-w-0 flex-1">
                      {row.slot?.label.trim() || !actName ? (
                        <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                          {row.slot?.label.trim() || (row.slot ? "Open position" : "No position")}
                        </p>
                      ) : null}
                      {actName ? (
                        <p className="truncate font-medium">{actName}</p>
                      ) : (
                        <p className="truncate text-muted-foreground">
                          Open · {TYPE_LABELS[row.slot?.artistType ?? "no_preference"]}
                          {row.slot?.genres.trim() ? ` · ${row.slot.genres.trim()}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
                      {openInquiries > 0 ? (
                        <span className="rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-800 dark:text-status-amber-200">
                          {openInquiries} inquir{openInquiries === 1 ? "y" : "ies"}
                        </span>
                      ) : null}
                      {row.performer?.awaitingOnboarding ? (
                        <span className="rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-800 dark:text-status-amber-200">
                          Onboarding
                        </span>
                      ) : null}
                      {row.performer ? (
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs",
                            rider?.rider?.status === "published"
                              ? "bg-muted text-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {rider?.rider?.status === "published" ? "Rider" : "No rider"}
                        </span>
                      ) : null}
                    </div>
                    <span className="hidden w-32 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:block">
                      {setStart != null && setEnd != null
                        ? `${formatTime(setStart)} – ${formatTime(setEnd)}`
                        : "No set time"}
                    </span>
                    <span className="hidden w-36 shrink-0 text-right text-xs tabular-nums lg:block">
                      {row.performer?.payment ? (
                        <>
                          {formatUsd(row.performer.payment.totalUsd)}
                          <span className="text-muted-foreground"> · {row.performer.payment.statusLabel}</span>
                        </>
                      ) : row.performer ? (
                        <span className="text-muted-foreground">No payout</span>
                      ) : null}
                    </span>
                    <span
                      data-testid="artist-need-status"
                      className={cn(
                        // Fixed width keeps the time and payout columns aligned across rows.
                        "w-20 shrink-0 rounded-md py-0.5 text-center text-xs font-medium",
                        effectiveStatusClass(status),
                      )}
                    >
                      {effectiveStatusLabel(status)}
                    </span>
                    <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${actName ?? "this position"}`}>
                          <DotsThreeIcon className="size-4" weight="bold" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSelectedKey(row.key)}>Open details</DropdownMenuItem>
                        {row.performer?.payment?.status !== "paid" ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => void handlers.removePosition(row)}
                            >
                              Remove from bill
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </CardContent>

      <PositionSheet
        row={selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
        eventId={eventId}
        canEdit={canEdit}
        rider={selectedRow?.performer ? riderByOrg.get(selectedRow.performer.organizationId) : undefined}
        excludedOrganizationIds={performers.map((row) => row.organizationId)}
        invoiceLine={
          selectedRow?.performer
            ? (invoiceArtistByOrg.get(selectedRow.performer.organizationId) ?? null)
            : null
        }
        invoiceDefaultsReady={
          !invoiceId || (invoiceDetail !== undefined && artistDayScope !== undefined)
        }
        handlers={handlers}
      />
      {addOpen ? (
        <AddToBillDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          eventId={eventId}
          openPositions={openPositions}
          excludedOrganizationIds={performers.map((row) => row.organizationId)}
        />
      ) : null}
    </Card>
  );
}
