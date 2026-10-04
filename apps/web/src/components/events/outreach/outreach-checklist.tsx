"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CaretDownIcon, CaretRightIcon, CheckIcon, PhoneIcon, PlusIcon } from "@phosphor-icons/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/convex-api";
import { ARTIST_TYPE_LABELS } from "@/lib/artist-types";
import {
  OUTREACH_RAIL,
  OUTREACH_STATUS_LABELS,
  countOutreach,
  daysAgo,
  daysSince,
  isStale,
  outreachSummary,
  type OutreachStatus,
} from "@/lib/artist-outreach";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { ArtistSelect, type ArtistSelectOption } from "@/components/bands/artist-select";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { EmptyState, RowFlag, RowMenu } from "@/components/list-page";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Outreach = FunctionReturnType<typeof api.eventArtistOutreach.listForEvent>;
type OutreachRow = Outreach["rows"][number];
type OutreachSlot = Outreach["slots"][number];
type DirectoryArtist = FunctionReturnType<typeof api.users.listArtistDirectory>[number];

const ANY_SLOT = "any";

async function attempt(action: () => Promise<unknown>, success?: string) {
  try {
    await action();
    if (success) notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

/** The act's booking contact, else the first member with a phone. */
function contactFor(artist: DirectoryArtist | undefined) {
  if (!artist) return null;
  const member = artist.members.find((person) => person.phone) ?? artist.members[0];
  const name = artist.mainContactName || member?.name || "";
  const phone = artist.mainContactPhone || member?.phone || "";
  return name || phone ? { name, phone } : null;
}

/**
 * The acts staff asked to play one event, and what each said. It's one list
 * for the whole bill, since an act free that night can fill any open slot; tag
 * an act for a slot when it only fits one, and book an available act into a
 * slot from here. Add acts from the artist directory, or an outside act by name.
 */
export function OutreachChecklist({
  eventId,
  canEdit = true,
  idPrefix,
}: {
  eventId: Id<"events">;
  canEdit?: boolean;
  /** Distinct ids when the checklist renders in more than one place. */
  idPrefix: string;
}) {
  const outreach = useQuery(api.eventArtistOutreach.listForEvent, { eventId });
  const directory = useQuery(api.users.listArtistDirectory, {});
  const add = useMutation(api.eventArtistOutreach.add);
  const [outsideName, setOutsideName] = useState("");
  const [showDeclined, setShowDeclined] = useState(false);
  const [now] = useState(() => Date.now());

  const directoryById = useMemo(
    () => new Map((directory ?? []).map((artist) => [artist.organizationId, artist])),
    [directory],
  );
  const options = useMemo<ArtistSelectOption[]>(() => {
    const added = new Set((outreach?.rows ?? []).flatMap((row) => (row.organizationId ? [row.organizationId] : [])));
    return (directory ?? [])
      .filter((artist) => !added.has(artist.organizationId))
      .map((artist) => {
        const contact = contactFor(artist);
        return {
          value: artist.organizationId,
          label: artist.name,
          description: [ARTIST_TYPE_LABELS[artist.organizationType], contact?.name].filter(Boolean).join(" · "),
          keywords: [artist.genres.join(" "), artist.oneLiner].join(" "),
        };
      });
  }, [directory, outreach]);

  if (outreach === undefined) {
    return <p className="text-sm text-muted-foreground">Loading outreach…</p>;
  }
  const { rows, slots } = outreach;
  const pending = rows.filter((row) => !row.booked);
  const bookedCount = rows.length - pending.length;
  const openSlots = slots.filter((slot) => slot.open);
  // Acts that can't make it fold away, so the list shows who's still in play.
  const declined = rows.filter((row) => !row.booked && row.status === "unavailable");
  const shown = showDeclined ? rows : rows.filter((row) => row.booked || row.status !== "unavailable");

  return (
    <div className="space-y-3" data-testid="outreach-checklist">
      <p className="text-sm" data-testid="outreach-summary">
        {[
          pending.length || !bookedCount ? outreachSummary(countOutreach(pending)) : null,
          bookedCount ? `${bookedCount} booked` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        <span className="text-muted-foreground">
          {" "}
          · {openSlots.length} open slot{openSlots.length === 1 ? "" : "s"} · In the order you asked.
        </span>
      </p>

      {rows.length === 0 ? (
        <EmptyState>
          Nobody asked yet. Add the acts you&apos;re texting about this date, then mark each reply here.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>Everyone you asked can&apos;t make it. Ask another act below.</EmptyState>
      ) : (
        <ul className="divide-y border">
          {shown.map((row) => (
            <OutreachItem
              key={row._id}
              row={row}
              slots={slots}
              artist={row.organizationId ? directoryById.get(row.organizationId) : undefined}
              canEdit={canEdit}
              now={now}
              idPrefix={idPrefix}
            />
          ))}
        </ul>
      )}
      {declined.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={showDeclined}
          onClick={() => setShowDeclined((value) => !value)}
          data-testid="outreach-declined-toggle"
        >
          {showDeclined ? <CaretDownIcon /> : <CaretRightIcon />}
          {`${showDeclined ? "Hide" : "Show"} ${declined.length} who can't`}
        </Button>
      ) : null}

      {canEdit && openSlots.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Ask another act</p>
          <ArtistSelect
            value=""
            onChange={(organizationId) => {
              if (!organizationId) return;
              void attempt(() => add({ eventId, organizationIds: [organizationId] }));
            }}
            options={options}
            placeholder="Search artists…"
            emptyLabel={directory === undefined ? "Loading artists…" : "Add an artist from the directory"}
          />
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = outsideName.trim();
              if (!name) return;
              void attempt(() => add({ eventId, externalName: name })).then((ok) => {
                if (ok) setOutsideName("");
              });
            }}
          >
            <Label htmlFor={`${idPrefix}-outreach-outside`} className="sr-only">
              Outside act name
            </Label>
            <Input
              id={`${idPrefix}-outreach-outside`}
              value={outsideName}
              placeholder="Or an act that isn't on the portal"
              onChange={(event) => setOutsideName(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!outsideName.trim()}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Book an act: one click when a single open slot fits it, else a menu of the
 * slots that fit, its tagged slot first.
 */
function BookButton({
  row,
  slots,
  busy,
  onBook,
}: {
  row: OutreachRow;
  slots: OutreachSlot[];
  busy: boolean;
  onBook: (needId: Id<"eventArtistNeeds">, label: string) => void;
}) {
  const fits = row.fitsNeedIds.flatMap((needId) => {
    const slot = slots.find((candidate) => candidate.needId === needId);
    return slot ? [slot] : [];
  });
  if (fits.length === 0) return null;
  if (fits.length === 1) {
    const [slot] = fits;
    return (
      <Button
        type="button"
        size="sm"
        disabled={busy}
        title={`Book into ${slot.label}`}
        onClick={() => onBook(slot.needId, slot.label)}
      >
        Book
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" disabled={busy}>
          Book
          <CaretDownIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Book {row.name} into</DropdownMenuLabel>
        {fits.map((slot) => (
          <DropdownMenuItem key={slot.needId} onSelect={() => onBook(slot.needId, slot.label)}>
            {slot.label}
            {slot.needId === row.needId ? <span className="ml-auto text-xs text-muted-foreground">Tagged</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OutreachItem({
  row,
  slots,
  artist,
  canEdit,
  now,
  idPrefix,
}: {
  row: OutreachRow;
  slots: OutreachSlot[];
  artist: DirectoryArtist | undefined;
  canEdit: boolean;
  now: number;
  idPrefix: string;
}) {
  const { confirm } = useAppDialog();
  const setStatus = useMutation(api.eventArtistOutreach.setStatus);
  const setNote = useMutation(api.eventArtistOutreach.setNote);
  const setSlot = useMutation(api.eventArtistOutreach.setSlot);
  const remove = useMutation(api.eventArtistOutreach.remove);
  const book = useMutation(api.eventArtistOutreach.book);
  const [note, setNoteDraft] = useState(row.note);
  const [busy, setBusy] = useState(false);
  const contact = contactFor(artist);
  const stale = !row.booked && isStale(row, now);
  const noteId = `${idPrefix}-outreach-note-${row._id}`;
  const firstFit = slots.find((slot) => slot.needId === row.fitsNeedIds[0]);
  // Open slots, plus the tagged one even once it's filled, so the tag still reads.
  const slotOptions = [
    { value: ANY_SLOT, label: "Any slot" },
    ...slots
      .filter((slot) => slot.open || slot.needId === row.needId)
      .map((slot) => ({ value: slot.needId, label: slot.label })),
  ];

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      return await attempt(action, success);
    } finally {
      setBusy(false);
    }
  }

  function bookInto(needId: Id<"eventArtistNeeds">, label: string) {
    void run(() => book({ outreachId: row._id, needId }), `Booked ${row.name} into ${label}.`);
  }

  async function confirmRemove() {
    const ok = await confirm({
      title: `Remove ${row.name} from the outreach list?`,
      description: row.booked
        ? "Only the checklist entry goes. They stay on the bill."
        : "Only the checklist entry goes. Nothing is sent to the act.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) await run(() => remove({ outreachId: row._id }));
  }

  const detail = [
    contact?.name,
    row.respondedAt && row.status !== "asked"
      ? daysAgo("Replied", row.respondedAt, now)
      : daysAgo("Asked", row.askedAt, now),
    row.askedByName ? `by ${row.askedByName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex gap-3 pr-1 text-sm" data-testid={`outreach-row-${row._id}`}>
      <span
        className={cn("w-1 shrink-0", row.booked ? "bg-status-emerald-500" : OUTREACH_RAIL[row.status])}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-2 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              {artist ? ARTIST_TYPE_LABELS[artist.organizationType] : row.organizationId ? "Artist" : "Outside act"}
            </p>
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
            {contact?.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="mt-0.5 inline-flex items-center gap-1 text-xs tabular-nums underline-offset-4 hover:underline"
              >
                <PhoneIcon className="size-3.5 text-muted-foreground" aria-hidden />
                {contact.phone}
              </a>
            ) : null}
          </div>
          {stale ? <RowFlag>No reply in {daysSince(row.askedAt, now)} days</RowFlag> : null}
          {row.booked ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-emerald-500/15 px-2 py-0.5 text-xs font-medium text-status-emerald-800 dark:text-status-emerald-200"
              data-testid="outreach-booked"
            >
              <CheckIcon className="size-3" weight="bold" aria-hidden />
              Booked · {row.booked.label}
            </span>
          ) : canEdit && row.status === "available" ? (
            <BookButton row={row} slots={slots} busy={busy} onBook={bookInto} />
          ) : null}
          {canEdit ? (
            <RowMenu label={`More for ${row.name}`}>
              {row.organizationId ? (
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/artists/directory?artist=${row.organizationId}`}>
                    Open in artist directory
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {!row.booked && row.status !== "available" && firstFit ? (
                <DropdownMenuItem onSelect={() => bookInto(firstFit.needId, firstFit.label)}>
                  Book into {firstFit.label}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void confirmRemove()}>
                Remove from list
              </DropdownMenuItem>
            </RowMenu>
          ) : null}
        </div>
        {canEdit && !row.booked ? (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={row.status}
              aria-label={`Reply from ${row.name}`}
              disabled={busy}
              onValueChange={(value) => {
                if (!value || value === row.status) return;
                void run(() => setStatus({ outreachId: row._id, status: value as OutreachStatus }));
              }}
            >
              {/* Static classes per reply, so the selected one is tinted by its meaning. */}
              <ToggleGroupItem
                value="asked"
                className="data-[state=on]:bg-status-amber-500/15 data-[state=on]:text-status-amber-800 dark:data-[state=on]:text-status-amber-200"
              >
                {OUTREACH_STATUS_LABELS.asked}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="available"
                className="data-[state=on]:bg-status-emerald-500/15 data-[state=on]:text-status-emerald-800 dark:data-[state=on]:text-status-emerald-200"
              >
                {OUTREACH_STATUS_LABELS.available}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="unavailable"
                className="data-[state=on]:bg-status-rose-500/15 data-[state=on]:text-status-rose-800 dark:data-[state=on]:text-status-rose-200"
              >
                {OUTREACH_STATUS_LABELS.unavailable}
              </ToggleGroupItem>
            </ToggleGroup>
            {slots.length > 1 && slots.some((slot) => slot.open) ? (
              <div className="w-40" data-testid="outreach-slot">
                <SearchableSelect
                  id={`${idPrefix}-outreach-slot-${row._id}`}
                  value={row.needId ?? ANY_SLOT}
                  onChange={(value) =>
                    void run(() =>
                      setSlot({
                        outreachId: row._id,
                        needId: value && value !== ANY_SLOT ? (value as Id<"eventArtistNeeds">) : null,
                      }),
                    )
                  }
                  options={slotOptions}
                  placeholder="Find a slot…"
                  emptyLabel="Any slot"
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {canEdit ? (
          <>
            <Label htmlFor={noteId} className="sr-only">
              Note for {row.name}
            </Label>
            <Input
              id={noteId}
              value={note}
              placeholder="Add a note"
              className="h-8 text-xs"
              onChange={(event) => setNoteDraft(event.target.value)}
              onBlur={() => {
                if (note.trim() === row.note) return;
                void run(() => setNote({ outreachId: row._id, note }));
              }}
            />
          </>
        ) : (
          <p className="text-xs">
            {row.booked ? `Booked · ${row.booked.label}` : OUTREACH_STATUS_LABELS[row.status]}
            {row.note ? <span className="text-muted-foreground"> · {row.note}</span> : null}
          </p>
        )}
      </div>
    </li>
  );
}
