"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { MicrophoneStageIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { ArtistSelect, ARTIST_TBD_VALUE, artistSelectOptions } from "@/components/bands/artist-select";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Input } from "@/components/ui/input";
import {
  ARTIST_TBD_LABEL,
  artistPersonHours,
  isTbdArtist,
  type ArtistRow,
  type InvoiceArtistPosition,
} from "./invoice-draft-model";
import { AmountCell, LineColumnHeads, LineGroup, LineRow, patchRow, plural, removeRow } from "./line-items-layout";
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
 * Artist lines. Each saved line opens or keeps a bill position on its day
 * (the lineup), so the positions the event already has are listed above.
 * Billed as hours × people × rate per person per hour.
 */
export function ArtistLines({ draft }: { draft: InvoiceDraft }) {
  const { lines, setSection, bandsForArtists: bands, linkedEvent, linkedSeries, linkedDayEvents } = draft;
  const rows = lines.artists;
  const artistNeedStatuses = useQuery(
    api.eventArtistNeeds.listNeedStatusForEvents,
    linkedEvent && !linkedSeries && linkedDayEvents.length > 0
      ? { eventIds: linkedDayEvents.map((day) => day._id) }
      : "skip",
  );
  const bandOptions = useMemo(() => artistSelectOptions(bands, { includeTbd: true }), [bands]);
  if (rows.length === 0) return null;

  const days = artistDays(draft);
  const multiDay = days.length > 1;
  const dayOptions = days.map((day) => ({ value: day._id, label: day.label, keywords: day.label }));
  const dayLabelByEventId = new Map(days.map((day) => [day._id, day.label]));
  const positions = (artistNeedStatuses ?? []).map((row) => ({
    eventId: row.eventId as string,
    needId: row.needId as string,
    label: row.label,
    artistType: row.artistType,
    status: row.status,
    genres: row.genres,
  }));
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

  return (
    <LineGroup
      icon={MicrophoneStageIcon}
      title="Artists"
      detail={plural(rows.length, "line")}
      subtotalUsd={draft.draftTotals.artistsSubtotalUsd}
      subtotalTestId="invoice-total-artists"
      testId="invoice-group-artists"
    >
      {positions.length > 0 ? (
        <ul className="space-y-0.5 px-3 py-2 text-xs text-muted-foreground" data-testid="invoice-artist-positions">
          {positions.map((position) => {
            const day = dayLabelByEventId.get(position.eventId);
            const name = position.label.trim() || ARTIST_TYPE_LABELS[position.artistType];
            const detail = [name, ARTIST_TYPE_LABELS[position.artistType], position.genres, position.status]
              .filter(Boolean)
              .join(" · ");
            return <li key={position.needId}>{day && multiDay ? `${day} — ${detail}` : detail}</li>;
          })}
        </ul>
      ) : null}
      <LineColumnHeads item="Artist" qty="Hours × people" rate="Rate / person / hr" />
      {rows.map((row, idx) => {
        const tbd = isTbdArtist(row);
        // An unscoped line applies to Day 1 on a multi-day booking (see
        // `lib/invoiceArtistDays.ts`), so show it there, not on the selected day.
        const dayId = row.eventId ?? days[0]?._id ?? "";
        return (
          <LineRow
            key={`artist-${idx}`}
            testId={`invoice-row-artist-${idx}`}
            removeLabel={`Remove ${tbd ? "artist" : row.label}`}
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
