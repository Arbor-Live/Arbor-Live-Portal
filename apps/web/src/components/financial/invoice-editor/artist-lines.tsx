"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { MicrophoneStageIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { ArtistSelect, ARTIST_TBD_VALUE, artistSelectOptions } from "@/components/bands/artist-select";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Input } from "@/components/ui/input";
import {
  ARTIST_TBD_LABEL,
  artistPersonHours,
  isTbdArtist,
  layoutArtistBill,
  type ArtistRow,
  type BillPosition,
  type InvoiceArtistPosition,
} from "./invoice-draft-model";
import {
  AmountCell,
  LineColumnHeads,
  LineGroup,
  LineRow,
  StaticCell,
  patchRow,
  plural,
  removeRow,
} from "./line-items-layout";
import type { InvoiceDraft } from "./use-invoice-draft";

const ARTIST_TYPE_LABELS: Record<InvoiceArtistPosition["artistType"], string> = {
  band: "Live band",
  dj: "DJ",
  singer_songwriter: "Singer-songwriter",
  no_preference: "No preference",
};

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
 * day, in bill order. A position this quote prices is an editable line; an
 * open one (no line yet) can be priced or removed from the event. Lines no
 * position backs yet (new, or on a series) follow. A line with no performer
 * booked prices an estimate.
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
      artistType: row.artistType,
      status: row.status,
      genres: row.genres,
      actOrganizationId: row.actOrganizationId,
      actName: row.actName,
      invoiceIds: row.invoiceIds as string[],
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
        return {
          ...row,
          organizationId,
          label: band?.name ?? row.label,
          people: band && band.memberCount > 0 ? band.memberCount.toString() : row.people,
          hours: row.hours || "1",
          rateUsd: band && band.performerHourlyRateUsd > 0 ? band.performerHourlyRateUsd.toString() : row.rateUsd,
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
        hours: "1",
        people: band && band.memberCount > 0 ? band.memberCount.toString() : "1",
        rateUsd: band && band.performerHourlyRateUsd > 0 ? band.performerHourlyRateUsd.toString() : "0",
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
      detail={[plural(rows.length, "line"), openCount > 0 ? `${openCount} not priced` : null]
        .filter(Boolean)
        .join(" · ")}
      subtotalUsd={draft.draftTotals.artistsSubtotalUsd}
      subtotalTestId="invoice-total-artists"
      testId="invoice-group-artists"
    >
      <LineColumnHeads item="Artist" qty="Hours × people" rate="Rate / person / hr" />
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
        const tbd = isTbdArtist(row);
        // An unscoped line applies to Day 1 on a multi-day booking (see
        // `lib/invoiceArtistDays.ts`), so show it there, not on the selected day.
        const dayId = row.eventId ?? days[0]?._id ?? "";
        return (
          <LineRow
            key={`artist-${idx}`}
            testId={`invoice-row-artist-${idx}`}
            removeLabel={`Remove ${tbd ? "artist" : row.label} from the quote`}
            onRemove={() => setRows((prev) => removeRow(prev, idx))}
            context={multiDay ? (dayLabelByEventId.get(dayId) ?? "Pick a day") : undefined}
            detailsLabel="artist day"
            details={
              multiDay ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Day</span>
                  <div className="w-40">
                    <SearchableSelect
                      value={dayId}
                      onChange={(value) => setRows((prev) => patchRow(prev, idx, { eventId: value }))}
                      options={dayOptions}
                      placeholder="Day"
                      emptyLabel="Day"
                    />
                  </div>
                </div>
              ) : undefined
            }
          >
            <div className="grid min-w-0 gap-2 @md/lines:grid-cols-2">
              <ArtistSelect
                value={tbd ? ARTIST_TBD_VALUE : row.organizationId}
                onChange={(value) => onBandChange(idx, value)}
                options={bandOptions}
                placeholder={bands === undefined ? "Loading artists…" : "Search artists…"}
                emptyLabel="Select artist"
              />
              {tbd ? (
                <Input
                  aria-label="Artist or role"
                  placeholder="Artist / role"
                  value={row.label === ARTIST_TBD_LABEL ? "" : row.label}
                  onChange={(event) =>
                    setRows((prev) => patchRow(prev, idx, { label: event.target.value || ARTIST_TBD_LABEL }))
                  }
                />
              ) : (
                <Input aria-label="Line label" value={row.label} readOnly className="bg-muted/40" />
              )}
              {tbd ? (
                <p className="text-xs text-muted-foreground @md/lines:col-span-2">
                  Estimate until a performer is booked.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Input
                aria-label="Hours"
                placeholder="Hours"
                inputMode="decimal"
                className="min-w-0 px-2"
                value={row.hours}
                onChange={(event) => setRows((prev) => patchRow(prev, idx, { hours: event.target.value }))}
              />
              <span className="text-muted-foreground" aria-hidden>
                ×
              </span>
              <Input
                aria-label="People"
                placeholder="People"
                inputMode="numeric"
                className="min-w-0 px-2"
                value={row.people}
                onChange={(event) => setRows((prev) => patchRow(prev, idx, { people: event.target.value }))}
              />
            </div>
            <Input
              aria-label="Rate per person per hour"
              placeholder="Rate / person / hr"
              inputMode="decimal"
              value={row.rateUsd}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { rateUsd: event.target.value }))}
            />
            <AmountCell
              amountUsd={artistPersonHours(row) * Number(row.rateUsd || "0")}
              hint={`${plural(artistPersonHours(row), "person-hr", "person-hrs")}`}
            />
          </LineRow>
        );
      })}
    </LineGroup>
  );
}

function positionName(position: BillPosition) {
  return position.actName || position.label.trim() || ARTIST_TYPE_LABELS[position.artistType];
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
    ARTIST_TYPE_LABELS[position.artistType],
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
