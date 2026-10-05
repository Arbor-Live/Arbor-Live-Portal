"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { LinkSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { EmptyState, ListSummary, RowCell, RowList, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetParam } from "@/hooks/use-sheet-param";
import { api } from "@/lib/convex-api";
import { formatRelativeTime } from "@/lib/format";
import {
  copyShortLink,
  LINK_STATUS_LABELS,
  LINK_STATUS_TONES,
  ShortLinkSheet,
  type ShortLinkRow,
} from "./short-link-sheet";

const LINK_STATUS_OPTIONS = (Object.keys(LINK_STATUS_LABELS) as ShortLinkRow["status"][]).map((value) => ({
  value,
  label: LINK_STATUS_LABELS[value],
}));

/** Every arbor.st redirect, most recently changed first, with a side panel to edit one. */
export function ShortLinksManager() {
  const links = useQuery(api.shortLinks.list, {});
  // `?link=<id>` opens a link; `?link=new` opens an empty one.
  const [panel, setPanel] = useSheetParam("link");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "status", label: "Status", options: LINK_STATUS_OPTIONS },
      {
        id: "event",
        label: "Event",
        options: [
          { value: "none", label: "Not linked to an event" },
          ...[
            ...new Map(
              (links ?? [])
                .filter((link) => link.eventId)
                .map((link) => [link.eventId as string, link.eventTitle ?? "Event"]),
            ).entries(),
          ]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ],
      },
    ],
    [links],
  );
  const narrowed = Boolean(search.trim()) || Object.keys(activeFilters(filters)).length > 0;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (links ?? []).filter(
      (link) =>
        (!q ||
          link.slug.toLowerCase().includes(q) ||
          link.label.toLowerCase().includes(q) ||
          link.destinationUrl.toLowerCase().includes(q)) &&
        matchesFilter(filters.status, link.status) &&
        matchesFilter(filters.event, (link.eventId as string | null) ?? "none"),
    );
  }, [filters, links, search]);

  const selected = panel && panel !== "new" ? ((links ?? []).find((link) => link._id === panel) ?? null) : null;
  const clicks = shown.reduce((sum, link) => sum + link.clickCount, 0);
  const active = shown.filter((link) => link.status === "active").length;

  return (
    <div className="space-y-4 pb-24" data-testid="short-links-page">
      <PageHeader
        title="Short links"
        description="arbor.st redirects for posters, socials and QR codes. Unknown paths still pass through to arborlive.stanford.edu. Links tied to an event also show on its Promo tab."
        actions={
          <Button type="button" size="sm" onClick={() => setPanel("new")}>
            <PlusIcon />
            New short link
          </Button>
        }
        meta={
          links ? (
            <MetaItem icon={LinkSimpleIcon}>
              {links.length} link{links.length === 1 ? "" : "s"}
            </MetaItem>
          ) : null
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search slug, label, or URL…"
        searchLabel="Search short links"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {links === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <ListSummary testId="short-links-summary" order="Most recently changed first.">
            {shown.length} link{shown.length === 1 ? "" : "s"} · {active} active · {clicks.toLocaleString()} click
            {clicks === 1 ? "" : "s"}
          </ListSummary>
          {shown.length === 0 ? (
            <EmptyState
              action={
                narrowed ? null : (
                  <Button type="button" size="sm" variant="outline" onClick={() => setPanel("new")}>
                    Create a short link
                  </Button>
                )
              }
            >
              {narrowed ? "No short links match this search and these filters." : "No short links yet."}
            </EmptyState>
          ) : (
            <RowList joined testId="short-links-list">
              {shown.map((link) => (
                <ListRow
                  key={link._id}
                  data-testid={`short-link-row-${link._id}`}
                  onOpen={() => setPanel(link._id)}
                  className={panel === link._id ? "bg-muted/40" : undefined}
                  actions={
                    <RowMenu label={`More for /${link.slug}`}>
                      <DropdownMenuItem onSelect={() => setPanel(link._id)}>Open details</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void copyShortLink(link.slug)}>Copy link</DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={link.destinationUrl} target="_blank" rel="noreferrer">
                          Open destination
                        </a>
                      </DropdownMenuItem>
                      {link.eventId ? (
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/events/${link.eventId}/promo`}>Open event</Link>
                        </DropdownMenuItem>
                      ) : null}
                    </RowMenu>
                  }
                >
                  <RowText
                    eyebrow={`/${link.slug}${link.eventTitle ? ` · ${link.eventTitle}` : ""}`}
                    title={link.label || `/${link.slug}`}
                    detail={link.destinationUrl}
                  />
                  <RowCell className="w-28" hideBelow="md" muted>
                    {link.lastClickedAt ? `last ${formatRelativeTime(link.lastClickedAt)}` : "never clicked"}
                  </RowCell>
                  <RowCell className="w-20">
                    {link.clickCount.toLocaleString()} click{link.clickCount === 1 ? "" : "s"}
                  </RowCell>
                  <StatusPill
                    tone={LINK_STATUS_TONES[link.status]}
                    className="hidden h-6 w-24 shrink-0 justify-center sm:inline-flex"
                  >
                    {LINK_STATUS_LABELS[link.status]}
                  </StatusPill>
                </ListRow>
              ))}
            </RowList>
          )}
        </>
      )}

      <ShortLinkSheet
        open={panel === "new" || selected !== null}
        link={selected}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      />
    </div>
  );
}
