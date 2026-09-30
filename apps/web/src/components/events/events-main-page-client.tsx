"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { EventsBoardView } from "@/components/events/events-board-view";
import { EventsUpcomingView } from "@/components/events/events-upcoming-view";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { EVENT_STATUS_EDITOR_OPTIONS, type EventStatus } from "@/lib/event-status";

const INVOICE_OPTIONS = [
  { value: "linked", label: "Has a linked invoice" },
  { value: "none", label: "No invoice yet" },
];

// FullCalendar is heavy; load it only when the calendar view actually renders.
const EventsCalendarView = dynamic(
  () => import("@/components/events/events-calendar-view").then((m) => m.EventsCalendarView),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Loading calendar...</p>,
  },
);

type EventsView = "calendar" | "board" | "upcoming";

export function EventsMainPageClient() {
  const [view, setView] = useState<EventsView>("board");
  // Cancelled events are hidden to start with, as a chip so they're one click away.
  const [filters, setFilters] = useState<FilterState>({
    status: { operator: "is_not", values: ["cancelled"] },
  });
  const [search, setSearch] = useState("");
  const applied = activeFilters(filters);

  const serverRows = useQuery(api.events.listForDashboard, {
    status:
      applied.status?.operator === "is" && applied.status.values.length === 1
        ? (applied.status.values[0] as EventStatus)
        : undefined,
    query: search || undefined,
    linkedInvoiceOnly:
      applied.invoice?.operator === "is" && applied.invoice.values[0] === "linked" ? true : undefined,
    includeCancelled: matchesFilter(applied.status, "cancelled") || undefined,
  });

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
    return [
      { id: "status", label: "Status", options: EVENT_STATUS_EDITOR_OPTIONS },
      { id: "type", label: "Type", options: distinct((serverRows ?? []).map((row) => row.eventType)) },
      { id: "venue", label: "Venue", options: distinct((serverRows ?? []).map((row) => row.venueName)) },
      { id: "invoice", label: "Invoice", options: INVOICE_OPTIONS, single: true },
    ];
  }, [serverRows]);

  // The server narrows what it can; the rest of the chips apply here.
  const rows = useMemo(
    () =>
      serverRows?.filter(
        (row) =>
          matchesFilter(applied.status, row.status) &&
          matchesFilter(applied.type, row.eventType ?? "") &&
          matchesFilter(applied.venue, row.venueName ?? "") &&
          matchesFilter(applied.invoice, row.invoiceId ? "linked" : "none"),
      ),
    [applied.invoice, applied.status, applied.type, applied.venue, serverRows],
  );

  return (
    <div className="space-y-3">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title, venue, type, host..."
        searchLabel="Search events"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      >
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant={view === "calendar" ? "default" : "outline"} onClick={() => setView("calendar")}>
            Calendar
          </Button>
          <Button type="button" variant={view === "board" ? "default" : "outline"} onClick={() => setView("board")}>
            Board
          </Button>
          <Button type="button" variant={view === "upcoming" ? "default" : "outline"} onClick={() => setView("upcoming")}>
            Upcoming
          </Button>
          <Button asChild>
            <Link href="/dashboard/events/new">Create Event</Link>
          </Button>
        </div>
      </FilterBar>

      {!rows ? <p className="text-sm text-muted-foreground">Loading events...</p> : null}
      {rows && view === "calendar" ? <EventsCalendarView events={rows} /> : null}
      {rows && view === "board" ? <EventsBoardView events={rows} /> : null}
      {rows && view === "upcoming" ? <EventsUpcomingView events={rows} /> : null}
    </div>
  );
}
