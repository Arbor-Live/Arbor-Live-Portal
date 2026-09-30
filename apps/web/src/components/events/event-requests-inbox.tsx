"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { formatDateTime, pacificDateKey } from "@/lib/format";
import { eventRequestStatusLabel, eventRequestStatusTone } from "@/lib/event-request-status";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

const REQUESTS_BASE = "/dashboard/financial-hub/requests";

type RequestStatus = "submitted" | "action_required" | "pending_client" | "converted" | "declined";

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "action_required", label: "Action required" },
  { value: "pending_client", label: "Pending client" },
  { value: "converted", label: "Converted" },
  { value: "declined", label: "Declined" },
];

const COMPLETED: RequestStatus[] = ["converted", "declined"];

/** The inbox's starting view: everything still open. */
const OPEN_VIEW: FilterState = { status: { operator: "is_not", values: COMPLETED } };

function isOpenView(filters: FilterState) {
  const applied = activeFilters(filters);
  const status = applied.status;
  return (
    Object.keys(applied).length === 1 &&
    status?.operator === "is_not" &&
    status.values.length === COMPLETED.length &&
    COMPLETED.every((value) => status.values.includes(value))
  );
}

type RequestRow = {
  _id: string;
  requestNumber: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization?: string;
  sponsorType: string;
  venueName?: string;
  eventDateText: string;
  eventName?: string;
  expectedTurnout: number;
  eventCategory: string;
  submittedAt: number;
  assigneeUserId?: string;
  assigneeName: string | null;
  convertedEventId?: string;
  convertedEventIds?: string[];
};

function daysAgoLabel(submittedAt: number) {
  const submittedKey = pacificDateKey(submittedAt);
  const todayKey = pacificDateKey(Date.now());
  const submittedParts = submittedKey.split("-").map(Number);
  const todayParts = todayKey.split("-").map(Number);
  if (submittedParts.length !== 3 || todayParts.length !== 3) return null;
  const submittedUtc = Date.UTC(submittedParts[0]!, submittedParts[1]! - 1, submittedParts[2]!);
  const todayUtc = Date.UTC(todayParts[0]!, todayParts[1]! - 1, todayParts[2]!);
  const days = Math.max(0, Math.round((todayUtc - submittedUtc) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Who acts next, in the order the inbox shows them. */
const GROUPS: { id: string; label: string; description: string; statuses: string[] }[] = [
  {
    id: "needs_you",
    label: "Needs you",
    description: "New requests and ones waiting on an answer from Arbor.",
    statuses: ["submitted", "action_required", "in_review"],
  },
  {
    id: "pending_client",
    label: "Pending client response",
    description: "Arbor has replied; the requester's move.",
    statuses: ["pending_client"],
  },
  { id: "converted", label: "Converted", description: "Became events.", statuses: ["converted"] },
  { id: "declined", label: "Declined", description: "Arbor said no.", statuses: ["declined"] },
];

function RequestRowItem({ row }: { row: RequestRow }) {
  const ago = daysAgoLabel(row.submittedAt);
  const events = row.convertedEventIds?.length ? row.convertedEventIds : row.convertedEventId ? [row.convertedEventId] : [];
  const title = row.eventName?.trim() || row.eventCategory;
  return (
    <ListRow
      data-testid={`request-row-${row._id}`}
      href={`${REQUESTS_BASE}/${row._id}`}
      actions={
        <RowMenu label={`More for ${row.requestNumber || title}`}>
          <DropdownMenuItem asChild>
            <Link href={`${REQUESTS_BASE}/${row._id}`}>Open request</Link>
          </DropdownMenuItem>
          {events.length === 1 ? (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/events/${events[0]}`}>View event</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <a href={`mailto:${row.email}`}>Email {row.firstName}</a>
          </DropdownMenuItem>
        </RowMenu>
      }
    >
      <RowText
        eyebrow={`${row.requestNumber ? `${row.requestNumber} · ` : ""}${row.eventDateText}`}
        title={`${title} · ${row.firstName} ${row.lastName}`}
        detail={[
          row.eventName ? row.eventCategory : null,
          row.venueName,
          row.organization ?? row.sponsorType,
          `${row.expectedTurnout} expected`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <RowCell className="w-32" align="left" hideBelow="lg" muted>
        {row.assigneeName ?? "Unassigned"}
      </RowCell>
      <RowCell className="w-24" hideBelow="md" muted>
        {ago ?? formatDateTime(row.submittedAt)}
      </RowCell>
      <StatusPill tone={eventRequestStatusTone(row.status)} className="hidden h-6 w-32 shrink-0 justify-center sm:inline-flex">
        {eventRequestStatusLabel(row.status)}
      </StatusPill>
    </ListRow>
  );
}

export function EventRequestsInbox() {
  // Starts on the open view, shown as a chip so completed requests are one click away.
  const [filters, setFilters] = useState<FilterState>(OPEN_VIEW);
  const [search, setSearch] = useState("");
  const [pendingOpen, setPendingOpen] = useState(false);
  const applied = activeFilters(filters);
  const status = applied.status;
  // A single `is` status reads through the status index; otherwise completed
  // requests load only when the chip lets them through.
  const rows = useQuery(api.eventRequests.list, {
    status: status?.operator === "is" && status.values.length === 1 ? (status.values[0] as RequestStatus) : undefined,
    includeTerminal: COMPLETED.some((value) => matchesFilter(status, value)),
  });

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (entries: Array<[string, string]>) =>
      [...new Map(entries).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return [
      { id: "status", label: "Status", options: STATUS_OPTIONS },
      {
        id: "assignee",
        label: "Assignee",
        options: [
          { value: "none", label: "Unassigned" },
          ...distinct(
            (rows ?? [])
              .filter((row) => row.assigneeUserId)
              .map((row) => [row.assigneeUserId!, row.assigneeName ?? "Unknown"]),
          ),
        ],
      },
      {
        id: "category",
        label: "Category",
        options: distinct((rows ?? []).map((row) => [row.eventCategory, row.eventCategory])),
      },
      {
        id: "sponsor",
        label: "Sponsor",
        options: distinct((rows ?? []).map((row) => [row.sponsorType, row.sponsorType])),
      },
    ];
  }, [rows]);

  const shownRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        (!needle ||
          [
            row.requestNumber,
            `${row.firstName} ${row.lastName}`,
            row.email,
            row.organization,
            row.venueName,
            row.eventName,
          ].some((field) => field?.toLowerCase().includes(needle))) &&
        matchesFilter(applied.status, row.status) &&
        matchesFilter(applied.assignee, row.assigneeUserId ?? "none") &&
        matchesFilter(applied.category, row.eventCategory) &&
        matchesFilter(applied.sponsor, row.sponsorType),
    );
  }, [applied.assignee, applied.category, applied.sponsor, applied.status, rows, search]);

  // The open view keeps "waiting on the client" out of the way, collapsed.
  const isDefaultOpenView = isOpenView(filters) && !search.trim();
  // Oldest first within a group: the longest-waiting request is the one to answer.
  const groupRows = (id: string) => {
    const statuses = GROUPS.find((group) => group.id === id)?.statuses ?? [];
    return shownRows.filter((row) => statuses.includes(row.status)).sort((a, b) => a.submittedAt - b.submittedAt);
  };
  const unassigned = shownRows.filter(
    (row) => !row.assigneeUserId && !["converted", "declined"].includes(row.status),
  ).length;

  return (
    <div className="space-y-4" data-testid="requests-inbox">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search number, name, email, venue…"
        searchLabel="Search booking requests"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />

      {rows === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <ListSummary testId="requests-summary" order="Grouped by who acts next; oldest request first, so nothing waits too long.">
            {shownRows.length} request{shownRows.length === 1 ? "" : "s"} · {groupRows("needs_you").length} need you ·{" "}
            {groupRows("pending_client").length} waiting on the requester
            {unassigned ? ` · ${unassigned} unassigned` : ""}
          </ListSummary>
          {shownRows.length === 0 ? (
            <EmptyState
              action={
                isDefaultOpenView ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters(OPEN_VIEW);
                    }}
                  >
                    Back to open requests
                  </Button>
                )
              }
            >
              {isDefaultOpenView ? "No open booking requests." : "No booking requests match this search and these filters."}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {GROUPS.map((group) => {
                const items = groupRows(group.id);
                if (items.length === 0 && group.id !== "needs_you") return null;
                // Waiting on the requester stays out of the way in the open view.
                const collapsible = group.id === "pending_client" && isDefaultOpenView;
                const collapsed = collapsible && !pendingOpen;
                return (
                  <RowGroup
                    key={group.id}
                    testId={`request-group-${group.id}`}
                    className="border"
                    title={group.label}
                    count={items.length}
                    tone={group.id === "needs_you" ? (items.length ? "amber" : "emerald") : "neutral"}
                    description={group.description}
                    aside={
                      collapsible && items.length ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPendingOpen((open) => !open)}>
                          {pendingOpen ? "Hide" : "Show"}
                        </Button>
                      ) : null
                    }
                  >
                    {items.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-muted-foreground">Nothing new. You&apos;re caught up.</li>
                    ) : collapsed ? null : (
                      items.map((row) => <RequestRowItem key={row._id} row={row} />)
                    )}
                  </RowGroup>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
