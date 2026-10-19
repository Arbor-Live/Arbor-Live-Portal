"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { MicrophoneStageIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { ArtistSelect, ARTIST_TBD_VALUE, artistSelectOptions } from "@/components/bands/artist-select";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingPriceFields, type BookingPriceDraft } from "@/components/events/lineup/booking-price";
import {
  ARTIST_TBD_LABEL,
  artistPersonHours,
  artistRowAmountUsd,
  artistRowPriceFields,
  isTbdArtist,
  layoutArtistBill,
  type ArtistRow,
  type BillPosition,
} from "./invoice-draft-model";
import {
  AmountCell,
  LineGroup,
  LineRow,
  StaticCell,
  patchRow,
  plural,
  removeRow,
} from "./line-items-layout";
import type { InvoiceDraft } from "./use-invoice-draft";
import { artistTypesLabel } from "@/components/events/lineup/lineup-model";


/** The linked days an artist line can belong to (multi-day bookings; none on a series). */
export function artistDays(draft: InvoiceDraft) {
  return draft.linkedSeries
    ? []
    : draft.linkedDayEvents.map((day, index) => ({ _id: day._id as string, label: `Day ${index + 1}` }));
}

/** The day a new artist line starts on: the selected linked day, else the first. */
export function defaultArtistDayId(draft: InvoiceDraft) {
  return draft.selectedDayEventId ?? artistDays(draft)[0]?._id;
}

/**
 * Artist lines, laid out as the event's bill: one row per position on each
 * day, in bill order. Like Crew is the Run of Show, this section is the
 * event's lineup: a line's people × hours × rate is the booking's price, so
 * saving the quote reprices the booking (and the act's payout), and a price
 * set on the Lineup shows up here. An open position (no line yet) can be
 * priced from its booking or removed from the event. Lines no position backs
 * yet (new, or on a series) follow. A line with no performer booked prices an
 * estimate.
 */
export function ArtistLines({ draft }: { draft: InvoiceDraft }) {
  const { lines, setSection, bandsForArtists: bands, linkedEvent, linkedSeries, linkedDayEvents, activeInvoiceId } =
    draft;
  const rows = lines.artists;
  const { confirm } = useAppDialog();
  const removeFromBill = useMutation(api.eventArtistNeeds.removeFromBill);
  const artistNeedStatuses = useQuery(
    api.eventArtistNeeds.listNeedStatusForEvents,
    linkedEvent && !linkedSeries && linkedDayEvents.length > 0
      ? { eventIds: linkedDayEvents.map((day) => day._id) }
      : "skip",
  );
  const bandOptions = useMemo(() => artistSelectOptions(bands, { includeTbd: true }), [bands]);

  const days = artistDays(draft);
  const multiDay = days.length > 1;
  const dayOptions = days.map((day) => ({ value: day._id, label: day.label, keywords: day.label }));
  const dayLabelByEventId = new Map(days.map((day) => [day._id, day.label]));
  const billItems = layoutArtistBill(
    rows,
    (artistNeedStatuses ?? []).map((row) => ({
      eventId: row.eventId as string,
      needId: row.needId as string,
      label: row.label,
      artistTypes: row.artistTypes,
      status: row.status,
      genres: row.genres,
      actOrganizationId: row.actOrganizationId,
      actName: row.actName,
      invoiceIds: row.invoiceIds as string[],
      price: row.price,
    })),
    activeInvoiceId,
  );
  if (billItems.length === 0) return null;

  const openCount = billItems.length - rows.length;
  const setRows = (updater: (rows: ArtistRow[]) => ArtistRow[]) => setSection("artists", updater);

  function onBandChange(idx: number, organizationId: string) {
    setRows((prev) =>
      patchRow(prev, idx, (row) => {
        if (!organizationId || organizationId === ARTIST_TBD_VALUE) {
          return { ...row, organizationId: ARTIST_TBD_VALUE, label: ARTIST_TBD_LABEL, hours: "1", people: "1", rateUsd: "0" };
        }
        const band = bands?.find((entry) => entry.organizationId === organizationId);
        // A priced row keeps its price; the profile only fills an unpriced one.
        if (artistRowAmountUsd(row) > 0) return { ...row, organizationId, label: band?.name ?? row.label };
        return {
          ...row,
          organizationId,
          label: band?.name ?? row.label,
          people: band && band.memberCount > 0 ? band.memberCount.toString() : row.people,
          hours: row.hours || "1",
          rateUsd: band && band.performerHourlyRateUsd > 0 ? band.performerHourlyRateUsd.toString() : row.rateUsd,
          fixedTotal: undefined,
        };
      }),
    );
  }

  function priceOpenPosition(position: BillPosition) {
    const band = position.actOrganizationId
      ? bands?.find((entry) => entry.organizationId === position.actOrganizationId)
      : undefined;
    setRows((prev) => [
      ...prev,
      {
        organizationId: position.actOrganizationId ?? ARTIST_TBD_VALUE,
        label: position.actName || position.label.trim() || ARTIST_TBD_LABEL,
        // The booking's price when the Lineup has one; else the act's profile.
        ...(position.price
          ? artistRowPriceFields(position.price)
          : {
              hours: "1",
              people: band && band.memberCount > 0 ? band.memberCount.toString() : "1",
              rateUsd: band && band.performerHourlyRateUsd > 0 ? band.performerHourlyRateUsd.toString() : "0",
            }),
        eventId: position.eventId,
        needId: position.needId,
      },
    ]);
  }

  async function removeOpenPosition(position: BillPosition) {
    const name = positionName(position);
    const ok = await confirm({
      title: `Remove ${name} from the event?`,
      description: position.actName
        ? `${position.actName} comes off the bill with the position.`
        : "The position comes off the event's Lineup.",
      destructive: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await removeFromBill({
        eventId: position.eventId as Id<"events">,
        needId: position.needId as Id<"eventArtistNeeds">,
        organizationId: position.actOrganizationId,
      });
      notify.success(`${name} removed from the event.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <LineGroup
      icon={MicrophoneStageIcon}
      title="Artists"
      detail={[
        plural(rows.length, "line"),
        openCount > 0 ? `${openCount} not priced` : null,
        linkedEvent && !linkedSeries ? "prices are the lineup's bookings, paid as billed" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      subtotalUsd={draft.draftTotals.artistsSubtotalUsd}
      subtotalTestId="invoice-total-artists"
      testId="invoice-group-artists"
    >
      {billItems.map((item) => {
        if (item.kind === "open") {
          const { position } = item;
          return (
            <OpenPositionRow
              key={`open-${position.needId}`}
              position={position}
              dayLabel={multiDay ? dayLabelByEventId.get(position.eventId) : undefined}
              onPrice={() => priceOpenPosition(position)}
              onRemove={() => void removeOpenPosition(position)}
            />
          );
        }
        const { idx } = item;
        const row = rows[idx]!;
        // An unscoped line applies to Day 1 on a multi-day booking (see
        // `lib/invoiceArtistDays.ts`), so show it there, not on the selected day.
        const dayId = row.eventId ?? days[0]?._id ?? "";
        return (
          <ArtistLineCard
            key={`artist-${idx}`}
            idx={idx}
            row={row}
            bandOptions={bandOptions}
            bandsLoading={bands === undefined}
            dayLabel={multiDay ? (dayLabelByEventId.get(dayId) ?? "Pick a day") : undefined}
            daySelect={
              multiDay ? (
                <div className="w-32 space-y-1">
                  <Label>Day</Label>
                  <SearchableSelect
                    value={dayId}
                    onChange={(value) => setRows((prev) => patchRow(prev, idx, { eventId: value }))}
                    options={dayOptions}
                    placeholder="Day"
                    emptyLabel="Day"
                  />
                </div>
              ) : undefined
            }
            onBandChange={(value) => onBandChange(idx, value)}
            onChange={(patch) => setRows((prev) => patchRow(prev, idx, patch))}
            onRemove={() => setRows((prev) => removeRow(prev, idx))}
          />
        );
      })}
    </LineGroup>
  );
}

/** A line's price in the shared price fields' terms (a lump sum keeps its total in `rateUsd`). */
function rowPriceDraft(row: ArtistRow): BookingPriceDraft {
  return row.fixedTotal
    ? { pricingMode: "fixed_total", memberCount: "1", performanceHours: "1", ratePerMemberPerHourUsd: "", fixedTotalUsd: row.rateUsd }
    : {
        pricingMode: "per_member_hourly",
        memberCount: row.people,
        performanceHours: row.hours,
        ratePerMemberPerHourUsd: row.rateUsd,
        fixedTotalUsd: "",
      };
}

function rowPricePatch(draft: BookingPriceDraft): Partial<ArtistRow> {
  return draft.pricingMode === "fixed_total"
    ? { fixedTotal: true, rateUsd: draft.fixedTotalUsd, hours: "1", people: "1" }
    : {
        fixedTotal: undefined,
        people: draft.memberCount,
        hours: draft.performanceHours,
        rateUsd: draft.ratePerMemberPerHourUsd,
      };
}

/**
 * One artist line, laid out like a position's Price section: who performs,
 * then a labeled price (per person per hour, or a lump sum).
 */
function ArtistLineCard({
  idx,
  row,
  bandOptions,
  bandsLoading,
  dayLabel,
  daySelect,
  onBandChange,
  onChange,
  onRemove,
}: {
  idx: number;
  row: ArtistRow;
  bandOptions: ReturnType<typeof artistSelectOptions>;
  bandsLoading: boolean;
  dayLabel?: string;
  daySelect?: React.ReactNode;
  onBandChange: (organizationId: string) => void;
  onChange: (patch: Partial<ArtistRow>) => void;
  onRemove: () => void;
}) {
  const tbd = isTbdArtist(row);
  const amount = artistRowAmountUsd(row);
  return (
    <div className="space-y-3 px-3 py-3 text-sm" data-testid={`invoice-row-artist-${idx}`}>
      {dayLabel ? (
        <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{dayLabel}</p>
      ) : null}
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 @md/lines:grid-cols-2">
          <ArtistSelect
            value={tbd ? ARTIST_TBD_VALUE : row.organizationId}
            onChange={onBandChange}
            options={bandOptions}
            placeholder={bandsLoading ? "Loading artists…" : "Search artists…"}
            emptyLabel="Select artist"
          />
          {tbd ? (
            <Input
              aria-label="Artist or role"
              placeholder="Artist / role"
              value={row.label === ARTIST_TBD_LABEL ? "" : row.label}
              onChange={(event) => onChange({ label: event.target.value || ARTIST_TBD_LABEL })}
            />
          ) : (
            <Input aria-label="Line label" value={row.label} readOnly className="bg-muted/40" />
          )}
          {tbd ? (
            <p className="text-xs text-muted-foreground @md/lines:col-span-2">Estimate until a performer is booked.</p>
          ) : null}
        </div>
        <div className="w-24 shrink-0">
          <AmountCell
            amountUsd={amount}
            hint={row.fixedTotal ? "lump sum" : plural(artistPersonHours(row), "person-hr", "person-hrs")}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-0.5"
          aria-label={`Remove ${tbd ? "artist" : row.label} from the quote`}
          title="Remove line"
          onClick={onRemove}
        >
          <TrashIcon />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <BookingPriceFields
          value={rowPriceDraft(row)}
          onChange={(next) => onChange(rowPricePatch(next))}
          idPrefix={`invoice-artist-${idx}`}
        />
        {daySelect}
      </div>
    </div>
  );
}

function positionName(position: BillPosition) {
  return position.actName || position.label.trim() || artistTypesLabel(position.artistTypes);
}

/** A position on the bill this quote doesn't price yet. */
function OpenPositionRow({
  position,
  dayLabel,
  onPrice,
  onRemove,
}: {
  position: BillPosition;
  dayLabel?: string;
  onPrice: () => void;
  onRemove: () => void;
}) {
  const role = position.label.trim();
  const detail = [
    position.actName && role ? role : null,
    artistTypesLabel(position.artistTypes),
    position.genres,
    position.actName ? "booked" : position.status,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <LineRow
      testId={`invoice-open-position-${position.needId}`}
      removeLabel={`Remove ${positionName(position)} from the event`}
      onRemove={onRemove}
      context={dayLabel}
    >
      <div className="min-w-0 pt-1.5">
        <p className="truncate font-medium">{positionName(position)}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <StaticCell>Not on this quote</StaticCell>
      <div>
        <Button type="button" size="sm" variant="outline" onClick={onPrice}>
          Price it
        </Button>
      </div>
      <StaticCell>—</StaticCell>
    </LineRow>
  );
}
