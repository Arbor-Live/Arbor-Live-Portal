"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import {
  EventMarketingContentFields,
  emptyMarketingLink,
  filterMarketingLinks,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { EventShortLinks } from "@/components/marketing/event-short-links-card";
import { PosterBrief } from "@/components/marketing/poster-brief";
import { activeFilters, FilterBar, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowList,
  RowMenu,
  RowText,
  SheetSection,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { PageHeader, StatusPill, type Tone } from "@/components/page-header";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { useSessionViewer } from "@/components/session-shell-provider";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { usePublishStatusToasts } from "@/hooks/use-publish-status-toasts";
import { formatDateTime } from "@/lib/format";
import { formatEventVisibilityLabel, type EventVisibility } from "@/lib/event-visibility";
import { PrintPosterButton } from "@/components/printing/print-poster-button";

type PosterStatus = "none" | "draft" | "ready" | "published";

const POSTER_STATUS: Record<PosterStatus, { label: string; tone: Tone }> = {
  none: { label: "Needs poster", tone: "amber" },
  draft: { label: "Draft", tone: "neutral" },
  ready: { label: "On website", tone: "blue" },
  published: { label: "Published", tone: "emerald" },
};

const POSTER_STATUS_OPTIONS = (Object.keys(POSTER_STATUS) as PosterStatus[]).map((value) => ({
  value,
  label: POSTER_STATUS[value].label,
}));

/** `?event=<id>` opens that event's poster panel. */
const EVENT_PARAM = "event";

function setEventParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(EVENT_PARAM, value);
  else url.searchParams.delete(EVENT_PARAM);
  window.history.replaceState(null, "", url);
}

function plural(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

const DEBOUNCE_MS = 200;

export function MarketingDesignBoard() {
  const searchParams = useSearchParams();
  const [now] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS);
  // Designers land on their own work; clear the chip to see everything.
  const [filters, setFilters] = useState<FilterState>({ designer: { operator: "is", values: ["me"] } });
  const [panelEventId, setPanelEventId] = useState<Id<"events"> | null>(
    () => (searchParams.get(EVENT_PARAM) as Id<"events"> | null) ?? null,
  );

  const applied = activeFilters(filters);
  const events = useQuery(api.marketingDesigns.listUpcomingPosterWork, {
    now,
    search: debouncedSearch.trim() || undefined,
    assignee: applied.designer,
    posterStatus: applied.poster,
  });
  const managerList = useQuery(api.invoices.listManagers, {});

  const userSelectOptions: UserSelectOption[] = useMemo(
    () => assignableCrewSelectOptions(managerList),
    [managerList],
  );

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        id: "designer",
        label: "Designer",
        options: [
          { value: "me", label: "Me" },
          { value: "unassigned", label: "Unassigned" },
          ...userSelectOptions.map((option) => ({ value: option.value, label: option.label })),
        ],
      },
      { id: "poster", label: "Poster", options: POSTER_STATUS_OPTIONS },
    ],
    [userSelectOptions],
  );

  function openPanel(eventId: Id<"events"> | null) {
    setPanelEventId(eventId);
    setEventParam(eventId);
  }

  const rows = events ?? [];
  const filterCount = (search.trim() ? 1 : 0) + Object.keys(applied).length;
  const counts = rows.reduce<Record<PosterStatus, number>>(
    (acc, row) => ({ ...acc, [row.posterStatus]: acc[row.posterStatus] + 1 }),
    { none: 0, draft: 0, ready: 0, published: 0 },
  );
  const unassigned = rows.filter((row) => !row.assigneeUserId).length;

  return (
    <div className="space-y-4 pb-24" data-testid="design-board-page">
      <PageHeader
        title="Design board"
        description="Posters for upcoming events that asked for design. Assign a designer, upload the poster, write the caption, then publish to Instagram and the public site."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search event, venue, host…"
        searchLabel="Search events"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {events === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary
            testId="design-board-summary"
            order="Soonest first, for the next four weeks. Open an event for its details and poster."
          >
            {plural(rows.length, "event")}
            {counts.none ? ` · ${counts.none} need a poster` : ""}
            {counts.draft ? ` · ${counts.draft} in draft` : ""}
            {counts.ready ? ` · ${counts.ready} on the website` : ""}
            {counts.published ? ` · ${counts.published} published` : ""}
            {unassigned ? ` · ${unassigned} without a designer` : ""}
          </ListSummary>

          {rows.length === 0 ? (
            <EmptyState
              action={
                filterCount ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : null
              }
            >
              {filterCount
                ? "No upcoming events match. Clear the filters to see every event that needs a poster."
                : "No events need a poster in the next four weeks. Events show up here once Design is one of their teams."}
            </EmptyState>
          ) : (
            <RowList testId="design-board-list">
              {rows.map((row) => {
                const status = POSTER_STATUS[row.posterStatus];
                return (
                  <ListRow
                    key={row.eventId}
                    data-testid="design-board-row"
                    onOpen={() => openPanel(row.eventId)}
                    actions={
                      <RowMenu label={`More for ${row.title}`}>
                        <DropdownMenuItem onSelect={() => openPanel(row.eventId)}>Open details</DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/events/${row.eventId}`}>Open event</Link>
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                  >
                    <RowCell className="w-36" align="left" muted>
                      {formatDateTime(row.startAt)}
                    </RowCell>
                    <RowText
                      eyebrow={row.visibility !== "public" ? formatEventVisibilityLabel(row.visibility as EventVisibility) : undefined}
                      title={row.title}
                      detail={[row.venueName, row.design?.caption ? "Caption written" : "No caption yet"]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    <RowCell className="w-40 truncate" align="left" hideBelow="md" muted>
                      {row.assigneeName ?? "Unassigned"}
                    </RowCell>
                    <span className="w-28 shrink-0">
                      <StatusPill tone={status.tone} className="h-6">
                        {status.label}
                      </StatusPill>
                    </span>
                  </ListRow>
                );
              })}
            </RowList>
          )}
        </>
      )}

      <DetailSheet
        open={panelEventId !== null}
        onOpenChange={(open) => {
          if (!open) openPanel(null);
        }}
        testId="design-board-sheet"
        className="data-[side=right]:sm:max-w-xl"
      >
        {panelEventId ? (
          <PosterWorkPanel key={panelEventId} eventId={panelEventId} userSelectOptions={userSelectOptions} />
        ) : null}
      </DetailSheet>
    </div>
  );
}

function PosterWorkPanel({
  eventId,
  userSelectOptions,
}: {
  eventId: Id<"events">;
  userSelectOptions: UserSelectOption[];
}) {
  const viewer = useSessionViewer();
  const canEditPoster = Boolean(viewer?.isAdmin || viewer?.verticals.includes("Marketing"));
  const design = useQuery(api.marketingDesigns.getForEvent, { eventId });
  const createDesign = useMutation(api.marketingDesigns.create);
  const markReady = useMutation(api.marketingDesigns.markReady);
  const assignPosterDesigner = useMutation(api.marketingDesigns.assignPosterDesigner);
  usePublishStatusToasts(design, eventId);

  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<MarketingAdditionalLink[]>([emptyMarketingLink()]);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState<"save" | "publish" | null>(null);

  // Seed the drafts once, when the design arrives; later server changes don't clobber edits.
  useEffect(() => {
    if (hydrated || !design) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from the loaded design */
    setHydrated(true);
    setImageUrl(design.imageUrl ?? "");
    setCaption(design.caption ?? "");
    setAdditionalLinks(design.additionalLinks?.length ? design.additionalLinks : [emptyMarketingLink()]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [design, hydrated]);

  if (design === undefined) {
    return (
      <>
        <DetailSheetHeader title="Poster" description="Loading the event's poster work." />
        <div className="space-y-3 px-4 py-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }
  if (design === null) {
    return <DetailSheetHeader title="Event not found" description="It may have been deleted." />;
  }

  const posterStatus: PosterStatus =
    design.status === null || (design.status === "draft" && !design.imageUrl) ? "none" : design.status;
  const status = POSTER_STATUS[posterStatus];

  async function saveDraft() {
    if (!imageUrl.trim()) {
      notify.error("Upload a poster image first.");
      return null;
    }
    return await createDesign({
      eventId,
      assigneeUserId: design?.assigneeUserId ?? undefined,
      imageUrl,
      caption: caption.trim() || undefined,
      additionalLinks: filterMarketingLinks(additionalLinks),
    });
  }

  async function handleSaveDraft() {
    setPending("save");
    try {
      if (await saveDraft()) notify.success("Draft saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function handlePublish() {
    setPending("publish");
    try {
      const designId = await saveDraft();
      if (!designId) return;
      await markReady({ id: designId });
      notify.info("Publishing to Instagram…");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function handleAssigneeChange(assigneeUserId: string) {
    try {
      await assignPosterDesigner({ eventId, assigneeUserId: assigneeUserId || undefined });
      notify.success(assigneeUserId ? "Poster designer assigned." : "Poster designer unassigned.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <>
      <DetailSheetHeader
        title={design.eventTitle}
        pill={
          <StatusPill tone={status.tone} className="h-6">
            {status.label}
          </StatusPill>
        }
        description={
          design.visibility !== "public"
            ? `${formatEventVisibilityLabel(design.visibility as EventVisibility)} event. It can be published once it's public.`
            : "Everything you need for the poster, then the poster itself."
        }
      />

      <SheetSection title="Poster designer">
        <UserSelect
          value={design.assigneeUserId ?? ""}
          onChange={(value) => void handleAssigneeChange(value)}
          options={userSelectOptions}
          emptyLabel="Unassigned"
          placeholder="Assign a designer…"
          clearable
        />
      </SheetSection>

      <PosterBrief eventId={eventId} />

      <SheetSection title="Poster">
        <EventMarketingContentFields
          idPrefix="design-board"
          imageUrl={imageUrl}
          onImageUrlChange={setImageUrl}
          imagePreviewUrl={design.imagePreviewUrl}
          caption={caption}
          onCaptionChange={setCaption}
          additionalLinks={additionalLinks}
          onAdditionalLinksChange={setAdditionalLinks}
          partifulCohostUrl={design.partifulCohostUrl ?? undefined}
          captionLabel="Caption"
          captionPlaceholder="Instagram caption and event description"
          disabled={pending !== null}
          readOnly={!canEditPoster}
          posterUpload={{ type: "event", eventId }}
        />
        {design.status === "published" ? (
          <p className="text-sm text-muted-foreground">
            Published{design.publishedAt ? ` ${formatDateTime(design.publishedAt)}` : ""}
            {design.instagramPostUrl ? (
              <>
                {" · "}
                <a
                  href={design.instagramPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  View Instagram post
                  <ArrowSquareOutIcon className="size-3" aria-hidden />
                </a>
              </>
            ) : null}
          </p>
        ) : design.status === "ready" ? (
          <p className="text-sm text-muted-foreground">On the public event page. Publish to post it to Instagram.</p>
        ) : null}
        {design.lastError ? (
          <p className="text-sm text-destructive">Last publish error: {design.lastError}</p>
        ) : null}
      </SheetSection>

      <EventShortLinks eventId={eventId} eventTitle={design.eventTitle} frame="section" />

      <DetailSheetFooter start={<PrintPosterButton designId={design.designId} savedImageUrl={design.imageUrl} />}>
        {canEditPoster ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void handleSaveDraft()}>
              {pending === "save" ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              disabled={pending !== null || !design.canPublish}
              title={design.canPublish ? undefined : "The event must be public before it can be published."}
              onClick={() => void handlePublish()}
            >
              {pending === "publish" ? "Publishing…" : "Publish"}
            </Button>
          </>
        ) : null}
      </DetailSheetFooter>
    </>
  );
}
