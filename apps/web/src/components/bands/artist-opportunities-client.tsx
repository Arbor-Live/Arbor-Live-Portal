"use client";

import { SheetSection } from "@/components/list-page";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  MapPinIcon,
  MicrophoneStageIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { formatDate, formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import {
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { PosterPlaceholderImage } from "@/components/public/poster-placeholder-image";
import { notify } from "@/lib/notify";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { cn } from "@/lib/utils";

type ArtistNeedType = "band" | "dj" | "no_preference";

const TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  no_preference: "No preference",
};

/**
 * "For you" is the default: positions looking for this act's kind of act, plus
 * positions open to anyone. The backend already excludes the other kind — a
 * band never sees a DJ-only position — so only an explicit type narrows further.
 */
const TYPE_FILTER_OPTIONS = [
  { value: "band", label: "Live band" },
  { value: "dj", label: "DJ" },
  { value: "no_preference", label: "No preference" },
];

const REQUESTED_OPTIONS = [
  { value: "requested", label: "Already requested" },
  { value: "open", label: "Not requested yet" },
];

export function ArtistOpportunitiesClient() {
  // `?position=<needId>` deep-links straight to a position's side panel.
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>({});
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("position"),
  );

  // Type and search narrow on the server; with no Type chip it's "for you".
  const serverNeeds = useQuery(api.eventArtistNeeds.listOpenNeedsForArtist, {
    artistType: (filters.type?.values[0] as ArtistNeedType | undefined) ?? undefined,
    query: search.trim() || undefined,
  });
  const needs = useMemo(
    () =>
      serverNeeds?.filter(
        (need) =>
          matchesFilter(filters.venue, need.venueName) &&
          matchesFilter(filters.requested, need.alreadyInquired ? "requested" : "open"),
      ),
    [filters.requested, filters.venue, serverNeeds],
  );
  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "type", label: "Type", options: TYPE_FILTER_OPTIONS, single: true },
      {
        id: "venue",
        label: "Venue",
        options: [...new Set((serverNeeds ?? []).map((need) => need.venueName).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
          .map((venue) => ({ value: venue, label: venue })),
      },
      { id: "requested", label: "Requested", options: REQUESTED_OPTIONS, single: true },
    ],
    [serverNeeds],
  );
  const inquiries = useQuery(api.eventArtistNeeds.listMyInquiries);

  const selectedRow = needs?.find((row) => row.needId === selectedId) ?? null;
  const requested = needs?.filter((need) => need.alreadyInquired).length ?? 0;

  return (
    <div className="space-y-4 pb-24" data-testid="opportunities-page">
      <PageHeader
        title="Opportunities"
        description="Positions on upcoming Arbor shows looking for an act like yours."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by event, venue, or genre"
        searchLabel="Search opportunities"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      <section className="space-y-2">
        {needs === undefined ? (
          <p className="text-sm text-muted-foreground">Loading open positions…</p>
        ) : needs.length === 0 ? (
          <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No open positions match right now. Try a different type or search.
          </p>
        ) : (
          <>
            <p className="text-sm" data-testid="opportunities-summary">
              {needs.length} open position{needs.length === 1 ? "" : "s"}
              {requested > 0 ? ` · ${requested} requested` : ""}
            </p>
            <p className="text-sm text-muted-foreground">Soonest shows first.</p>
            <ul className="divide-y border">
              {needs.map((need) => (
                <OpportunityRow
                  key={need.needId}
                  need={need}
                  onOpen={() => setSelectedId(need.needId)}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <MyRequests inquiries={inquiries} />

      <OpportunitySheet
        row={selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

type OpportunityRowData = FunctionReturnType<
  typeof api.eventArtistNeeds.listOpenNeedsForArtist
>[number];
type InquiryRowData = FunctionReturnType<typeof api.eventArtistNeeds.listMyInquiries>[number];

function PosterTile({
  imageUrl,
  seed,
  title,
  className,
}: {
  imageUrl?: string;
  seed: string;
  title: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={cn("aspect-(--aspect-poster) shrink-0 border object-cover", className)}
      />
    );
  }
  return <PosterPlaceholderImage seed={seed} title={title} className={cn("shrink-0 border", className)} />;
}

function OpportunityRow({
  need,
  onOpen,
}: {
  need: OpportunityRowData;
  onOpen: () => void;
}) {
  return (
    <ListRow
      data-testid="opportunity-row"
      onOpen={onOpen}
      className="border-0 gap-3 pr-3 pl-4"
      bodyClassName="py-3"
      actions={
        need.alreadyInquired ? (
          <StatusPill tone="blue" className="h-7 shrink-0">
            Requested
          </StatusPill>
        ) : (
          <Button type="button" variant="outline" className="shrink-0" onClick={onOpen}>
            Inquire
          </Button>
        )
      }
    >
      <PosterTile imageUrl={need.posterUrl} seed={need.eventId} title={need.title} className="w-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {formatDate(need.startAt)} · {need.venueName || "Venue TBD"}
        </p>
        <p className="truncate font-medium">{need.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {need.setStartsAt != null ? `Set ${formatTime(need.setStartsAt)} · ` : ""}
          {TYPE_LABELS[need.artistType]}
          {need.genres ? ` · ${need.genres}` : ""}
        </p>
        {need.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{need.description}</p>
        ) : null}
      </div>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </ListRow>
  );
}

function MyRequests({
  inquiries,
}: {
  inquiries: InquiryRowData[] | undefined;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <MicrophoneStageIcon className="size-4 text-muted-foreground" />
        My requests
      </h2>
      {inquiries === undefined ? (
        <p className="text-sm text-muted-foreground">Loading your requests…</p>
      ) : inquiries.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          You have not requested any events yet. Open a position above and send an inquiry.
        </p>
      ) : (
        <ul className="divide-y border">
          {inquiries.map((inquiry) => (
            <li
              key={inquiry.inquiryId}
              data-testid="inquiry-row"
              className="flex items-center gap-3 py-3 pr-3 pl-4 text-sm"
            >
              <PosterTile
                imageUrl={inquiry.posterUrl}
                seed={inquiry.eventId}
                title={inquiry.title}
                className="w-12"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                  {formatDate(inquiry.startAt)}
                  {inquiry.venueName ? ` · ${inquiry.venueName}` : ""}
                </p>
                <p className="truncate font-medium">{inquiry.title}</p>
                {inquiry.genres ? (
                  <p className="truncate text-xs text-muted-foreground">{inquiry.genres}</p>
                ) : null}
              </div>
              {inquiry.publicEventUrl ? (
                <Button asChild variant="outline" className="shrink-0">
                  <a href={inquiry.publicEventUrl} target="_blank" rel="noreferrer">
                    View event page
                    <ArrowSquareOutIcon className="size-3" />
                  </a>
                </Button>
              ) : null}
              <StatusPill
                tone={inquiry.status === "submitted" ? "blue" : "neutral"}
                className="h-7 w-24 shrink-0 justify-center capitalize"
              >
                {inquiry.status}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpportunitySheet({
  row,
  onOpenChange,
}: {
  row: OpportunityRowData | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="opportunity-sheet"
      >
        {row ? (
          // Keyed so the inquiry draft resets when another row opens.
          <OpportunitySheetBody key={row.needId} row={row} onClose={() => onOpenChange(false)} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OpportunitySheetBody({
  row,
  onClose,
}: {
  row: OpportunityRowData;
  onClose: () => void;
}) {
  const submitInquiry = useMutation(api.eventArtistNeeds.submitInquiry);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      await submitInquiry({ needId: row.needId, message: message.trim() || undefined });
      notify.success("Request sent. Operations will follow up.");
      onClose();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.title}</SheetTitle>
        <SheetDescription>
          {row.label.trim() ? `${row.label.trim()} · ` : ""}
          {TYPE_LABELS[row.artistType]}
        </SheetDescription>
      </SheetHeader>

      <div className="flex justify-center border-t px-4 py-4">
        <PosterTile
          imageUrl={row.posterUrl}
          seed={row.eventId}
          title={row.title}
          className="w-56"
        />
      </div>

      <SheetSection title="When and where">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <MetaItem icon={CalendarBlankIcon}>{formatDate(row.startAt)}</MetaItem>
          <MetaItem icon={MapPinIcon}>{row.venueName || "Venue TBD"}</MetaItem>
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Set</dt>
          <dd>
            {row.setStartsAt != null
              ? row.setEndsAt != null
                ? `${formatTime(row.setStartsAt)} – ${formatTime(row.setEndsAt)}`
                : formatTime(row.setStartsAt)
              : "Not set yet"}
          </dd>
        </dl>
      </SheetSection>

      <SheetSection title="What they're looking for">
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Position</dt>
          <dd>{row.label.trim() || "Open position"}</dd>
          <dt className="text-muted-foreground">Act</dt>
          <dd>{TYPE_LABELS[row.artistType]}</dd>
          {row.genres ? (
            <>
              <dt className="text-muted-foreground">Genres</dt>
              <dd>{row.genres}</dd>
            </>
          ) : null}
        </dl>
      </SheetSection>

      {row.description ? (
        <SheetSection title="About the show">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{row.description}</p>
        </SheetSection>
      ) : null}

      <SheetSection title="Your request">
        {row.alreadyInquired ? (
          <p className="text-sm text-muted-foreground">
            You&apos;ve already requested this show. Operations will follow up.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="opportunity-inquiry-note">Note to Operations (optional)</Label>
              <Textarea
                id="opportunity-inquiry-note"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell them about your act, links, or availability"
              />
            </div>
            <Button type="button" disabled={sending} onClick={() => void handleSend()}>
              {sending ? "Sending…" : "Send inquiry"}
            </Button>
          </div>
        )}
      </SheetSection>

      {row.publicEventUrl ? (
        <SheetFooter className="flex-row justify-end border-t">
          <Button asChild variant="outline">
            <a href={row.publicEventUrl} target="_blank" rel="noreferrer">
              View event page
              <ArrowSquareOutIcon className="size-3" />
            </a>
          </Button>
        </SheetFooter>
      ) : null}
    </>
  );
}
