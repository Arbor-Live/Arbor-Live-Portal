"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowSquareOutIcon,
  CaretRightIcon,
  CopyIcon,
  EnvelopeSimpleIcon,
  PhoneIcon,
} from "@phosphor-icons/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex-api";
import { ARTIST_TYPES, ARTIST_TYPE_LABELS } from "@/lib/artist-types";
import { matchArtistDirectoryEntry, type ArtistDirectoryPerson } from "@/lib/artist-directory";
import { formatBandPublicArtistUrl } from "@/lib/band-public-link";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { FilterBar, matchesFilter, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowFlag,
  RowList,
  RowMenu,
  RowText,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

type DirectoryArtist = FunctionReturnType<typeof api.users.listArtistDirectory>[number];

const FILTERS: FilterDefinition[] = [
  {
    id: "type",
    label: "Type",
    options: ARTIST_TYPES.map((type) => ({ value: type, label: ARTIST_TYPE_LABELS[type] })),
  },
  {
    id: "upcoming",
    label: "Upcoming show",
    single: true,
    options: [
      { value: "yes", label: "Has an upcoming show" },
      { value: "no", label: "No upcoming show" },
    ],
  },
  {
    id: "listing",
    label: "Listing",
    single: true,
    options: [
      { value: "public", label: "Public listing" },
      { value: "internal", label: "Internal only" },
    ],
  },
];

function hasContact(artist: DirectoryArtist) {
  return Boolean(
    artist.mainContactName ||
      artist.mainContactEmail ||
      artist.mainContactPhone ||
      artist.members.some((member) => member.email || member.phone),
  );
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    notify.success(`${label} copied.`);
  } catch {
    notify.error(`Could not copy ${label.toLowerCase()}.`);
  }
}

/**
 * Every active artist and the people to reach, listed publicly or not, for
 * staff working out who's who in a band group chat. Search matches people and
 * phone numbers too, and the row says who matched.
 */
export function ArtistDirectory() {
  const artists = useQuery(api.users.listArtistDirectory, {});
  const viewer = useSessionViewer();
  const [selectedId, setSelectedId] = useSheetParam("artist");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [filters, setFilters] = useState<FilterState>({});

  const rows = useMemo(() => {
    if (!artists) return undefined;
    return artists.flatMap((artist) => {
      if (!matchesFilter(filters.type, artist.organizationType)) return [];
      if (!matchesFilter(filters.upcoming, artist.nextShow ? "yes" : "no")) return [];
      if (!matchesFilter(filters.listing, artist.publicListing ? "public" : "internal")) return [];
      const match = matchArtistDirectoryEntry(artist, query);
      return match ? [{ artist, matched: match.person }] : [];
    });
  }, [artists, filters, query]);

  const summary = useMemo(() => {
    const list = rows?.map((row) => row.artist) ?? [];
    return {
      total: list.length,
      upcoming: list.filter((artist) => artist.nextShow).length,
      noContact: list.filter((artist) => !hasContact(artist)).length,
    };
  }, [rows]);

  const selected = artists?.find((artist) => artist.organizationId === selectedId) ?? null;

  return (
    <div className="space-y-3" data-testid="artist-directory">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search artists, people, emails, phone numbers…"
        searchLabel="Search artists"
        filters={FILTERS}
        value={filters}
        onChange={setFilters}
      />

      {rows === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <>
          <ListSummary testId="artist-directory-summary" order="Alphabetical.">
            {summary.total} artist{summary.total === 1 ? "" : "s"} · {summary.upcoming} with an upcoming show
            {summary.noContact > 0 ? ` · ${summary.noContact} without contact details` : ""}
          </ListSummary>
          {rows.length === 0 ? (
            <EmptyState>
              {artists && artists.length > 0
                ? "No artists match. Try part of a name or the last digits of a phone number."
                : "No artists yet. Artists appear here once they have an organization on the portal."}
            </EmptyState>
          ) : (
            <RowList>
              {rows.map(({ artist, matched }) => (
                <ArtistRow
                  key={artist.organizationId}
                  artist={artist}
                  matched={matched}
                  onOpen={() => setSelectedId(artist.organizationId)}
                />
              ))}
            </RowList>
          )}
        </>
      )}

      <DetailSheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        testId="artist-directory-sheet"
      >
        {selected ? (
          <ArtistSheetBody key={selected.organizationId} artist={selected} isAdmin={viewer?.isAdmin ?? false} />
        ) : null}
      </DetailSheet>
    </div>
  );
}

function contactLine(artist: DirectoryArtist, matched: ArtistDirectoryPerson | null) {
  if (matched) {
    const role = matched.source === "listed" ? "listed member" : matched.role || "member";
    return `Matched ${matched.name || matched.email || matched.phone} · ${role}`;
  }
  const contact = artist.mainContactName || artist.members[0]?.name;
  const phone = artist.mainContactPhone || artist.members.find((member) => member.phone)?.phone;
  if (!contact && !phone) return null;
  return [contact, phone].filter(Boolean).join(" · ");
}

function ArtistRow({
  artist,
  matched,
  onOpen,
}: {
  artist: DirectoryArtist;
  matched: ArtistDirectoryPerson | null;
  onOpen: () => void;
}) {
  const line = contactLine(artist, matched);
  const phone = artist.mainContactPhone || artist.members.find((member) => member.phone)?.phone || "";
  return (
    <ListRow
      data-testid={`artist-directory-row-${artist.organizationId}`}
      onOpen={onOpen}
      actions={
        <RowMenu label={`More for ${artist.name}`}>
          <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
          {phone ? (
            <DropdownMenuItem onSelect={() => void copyText(phone, "Phone number")}>
              <CopyIcon />
              Copy contact phone
            </DropdownMenuItem>
          ) : null}
          {artist.nextShow ? (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/events/${artist.nextShow.eventId}`}>Open next show</Link>
            </DropdownMenuItem>
          ) : null}
        </RowMenu>
      }
    >
      <RowText
        eyebrow={ARTIST_TYPE_LABELS[artist.organizationType]}
        title={artist.name}
        detail={line ?? (artist.oneLiner || undefined)}
      />
      {hasContact(artist) ? null : <RowFlag>No contact</RowFlag>}
      <RowCell className="w-44" hideBelow="md" muted>
        {artist.nextShow ? (
          <span className="block truncate" title={artist.nextShow.title}>
            Next: {formatDate(artist.nextShow.startAt)}
          </span>
        ) : (
          "No upcoming show"
        )}
      </RowCell>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </ListRow>
  );
}

function ContactLinks({ email, phone }: { email: string; phone: string }) {
  if (!email && !phone) return <span className="text-muted-foreground">No email or phone</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {phone ? (
        <span className="flex items-center gap-1.5">
          <PhoneIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <a href={`tel:${phone}`} className="tabular-nums underline-offset-4 hover:underline">
            {phone}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Copy ${phone}`}
            title="Copy phone number"
            onClick={() => void copyText(phone, "Phone number")}
          >
            <CopyIcon />
          </Button>
        </span>
      ) : null}
      {email ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <EnvelopeSimpleIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <a href={`mailto:${email}`} className="truncate underline-offset-4 hover:underline">
            {email}
          </a>
        </span>
      ) : null}
    </span>
  );
}

function ShowLink({ show }: { show: NonNullable<DirectoryArtist["nextShow"]> }) {
  return (
    <Link href={`/dashboard/events/${show.eventId}`} className="underline-offset-4 hover:underline">
      {show.title}
      <span className="text-muted-foreground"> · {formatDate(show.startAt)}</span>
    </Link>
  );
}

function ArtistSheetBody({ artist, isAdmin }: { artist: DirectoryArtist; isAdmin: boolean }) {
  const publicUrl = artist.publicListing ? formatBandPublicArtistUrl(artist.publicSlug) : "";
  const listed = artist.bandMembers.filter((name) => name.trim());
  return (
    <>
      <DetailSheetHeader
        title={artist.name}
        pill={
          artist.publicListing ? (
            <StatusPill tone="emerald">Public listing</StatusPill>
          ) : (
            <StatusPill tone="neutral">Internal only</StatusPill>
          )
        }
        description={
          [ARTIST_TYPE_LABELS[artist.organizationType], artist.genres.join(", "), artist.oneLiner]
            .filter(Boolean)
            .join(" · ")
        }
      />

      <SheetSection title="Main contact">
        {artist.mainContactSource !== "none" ? (
          <>
          <SheetFields>
            <SheetField label="Name">{artist.mainContactName || "—"}</SheetField>
            <SheetField label="Reach">
              <ContactLinks email={artist.mainContactEmail} phone={artist.mainContactPhone} />
            </SheetField>
          </SheetFields>
          {artist.mainContactSource === "rider" ? (
            <p className="text-xs text-muted-foreground">
              From the default rider&apos;s day-of contact. The profile has no booking contact.
            </p>
          ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No main contact on file. The artist can add one on their profile.
          </p>
        )}
      </SheetSection>

      <SheetSection title={`Portal members (${artist.members.length})`}>
        {artist.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody from this act has joined the portal yet.</p>
        ) : (
          <ul className="divide-y border" data-testid="artist-directory-members">
            {artist.members.map((member) => (
              <li key={member.userId} className="space-y-1 px-3 py-2.5 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{member.name}</span>
                  {member.bandRole ? <span className="text-muted-foreground">{member.bandRole}</span> : null}
                  {member.isOrgAdmin ? <RowFlag tone="neutral">Admin</RowFlag> : null}
                </p>
                <ContactLinks email={member.email} phone={member.phone} />
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      {listed.length > 0 ? (
        <SheetSection title="Also listed in the band">
          <p className="text-sm">{listed.join(", ")}</p>
          <p className="text-xs text-muted-foreground">Names from the artist&apos;s profile. They aren&apos;t on the portal.</p>
        </SheetSection>
      ) : null}

      {artist.payeeName || artist.payeeEmail ? (
        <SheetSection title="Payee">
          <SheetFields>
            <SheetField label="Name">{artist.payeeName || "—"}</SheetField>
            <SheetField label="Email">
              {artist.payeeEmail ? (
                <a href={`mailto:${artist.payeeEmail}`} className="underline-offset-4 hover:underline">
                  {artist.payeeEmail}
                </a>
              ) : (
                "—"
              )}
            </SheetField>
          </SheetFields>
        </SheetSection>
      ) : null}

      <SheetSection title="Shows">
        <SheetFields>
          <SheetField label="Next">
            {artist.nextShow ? <ShowLink show={artist.nextShow} /> : <span className="text-muted-foreground">None booked</span>}
          </SheetField>
          <SheetField label="Last">
            {artist.lastShow ? <ShowLink show={artist.lastShow} /> : <span className="text-muted-foreground">None yet</span>}
          </SheetField>
        </SheetFields>
      </SheetSection>

      {publicUrl || isAdmin ? (
        <DetailSheetFooter>
          {isAdmin ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/users/organizations?org=${artist.organizationId}`}>Manage organization</Link>
            </Button>
          ) : null}
          {publicUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                View public page
                <ArrowSquareOutIcon className="size-3" aria-hidden />
              </a>
            </Button>
          ) : null}
        </DetailSheetFooter>
      ) : null}
    </>
  );
}
