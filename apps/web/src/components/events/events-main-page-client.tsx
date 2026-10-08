"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSyncExternalStore, useMemo, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ACADEMIC_PERIOD_LABELS,
  academicPeriod,
  periodMsRange,
  type AcademicPeriodPreset,
} from "@/lib/academic-periods";
import { EVENT_STATUS_EDITOR_OPTIONS, type EventStatus } from "@/lib/event-status";
import { usePacificToday } from "@/hooks/use-pacific-today";

const WHEN_PRESETS: AcademicPeriodPreset[] = ["this-quarter", "last-quarter", "next-quarter", "this-year"];

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

const EVENTS_VIEWS = ["calendar", "board", "upcoming"] as const;

type EventsView = (typeof EVENTS_VIEWS)[number];

function isEventsView(value: string | null): value is EventsView {
  return EVENTS_VIEWS.includes(value as EventsView);
}

const WIDE_SCREEN_QUERY = "(min-width: 768px)";

function subscribeToWideScreen(callback: () => void) {
  const mediaQuery = window.matchMedia(WIDE_SCREEN_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function isWideScreen() {
  return window.matchMedia(WIDE_SCREEN_QUERY).matches;
}

export function EventsMainPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const viewParam = searchParams.get("view");
  // `?view=` wins. Without it the default is board on wide screens and upcoming
  // on phones; the server renders board (the wide snapshot) so hydration is
  // consistent, and the client picks up the real viewport from there.
  const wideScreen = useSyncExternalStore(subscribeToWideScreen, isWideScreen, () => true);
  const view: EventsView = isEventsView(viewParam) ? viewParam : wideScreen ? "board" : "upcoming";

  function selectView(next: EventsView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  // Cancelled events are hidden to start with, as a chip so they're one click away.
  const [filters, setFilters] = useState<FilterState>({
    status: { operator: "is_not", values: ["cancelled"] },
  });
  const [search, setSearch] = useState("");
  const applied = activeFilters(filters);
  const todayKey = usePacificToday();
  // "When" options are Stanford periods; ones outside the calendar are left out.
  const whenPeriods = useMemo(
    () =>
      WHEN_PRESETS.flatMap((preset) => {
        const period = academicPeriod(preset, todayKey);
        return period ? [{ preset, ...period, ...periodMsRange(period) }] : [];
      }),
    [todayKey],
  );
  // "When" is one period (no "is not"), so it always narrows on the server by start date.
  const serverWindow = whenPeriods.find((period) => period.preset === applied.when?.values[0]);

  const result = useQuery(api.events.listForDashboard, {
    status:
      applied.status?.operator === "is" && applied.status.values.length === 1
        ? (applied.status.values[0] as EventStatus)
        : undefined,
    query: search || undefined,
    linkedInvoiceOnly:
      applied.invoice?.operator === "is" && applied.invoice.values[0] === "linked" ? true : undefined,
    includeCancelled: matchesFilter(applied.status, "cancelled") || undefined,
    startMs: serverWindow?.startMs,
    endMs: serverWindow?.endMs,
  });
  const serverRows = result?.events;

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const distinct = (values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
    return [
      {
        id: "when",
        label: "When",
        options: whenPeriods.map((period) => ({
          value: period.preset,
          label: `${ACADEMIC_PERIOD_LABELS[period.preset]} (${period.label})`,
        })),
        single: true,
        negatable: false,
      },
      { id: "status", label: "Status", options: EVENT_STATUS_EDITOR_OPTIONS },
      { id: "type", label: "Type", options: distinct((serverRows ?? []).map((row) => row.eventType)) },
      { id: "venue", label: "Venue", options: distinct((serverRows ?? []).map((row) => row.venueName)) },
      { id: "invoice", label: "Invoice", options: INVOICE_OPTIONS, single: true },
    ];
  }, [serverRows, whenPeriods]);

  // The server narrows what it can; the rest of the chips apply here.
  const rows = useMemo(
    () =>
      serverRows?.filter(
        (row) =>
          matchesFilter(applied.status, row.status) &&
          matchesFilter(applied.type, row.eventType ?? "") &&
          matchesFilter(applied.venue, row.venueName ?? "") &&
          matchesFilter(applied.invoice, row.invoiceId ? "linked" : "none") &&
          matchesFilter(
            applied.when,
            whenPeriods
              .filter((period) => row.startAt >= period.startMs && row.startAt <= period.endMs)
              .map((period) => period.preset),
          ),
      ),
    [applied.invoice, applied.status, applied.type, applied.venue, applied.when, serverRows, whenPeriods],
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
          <ToggleGroup
            type="single"
            size="lg"
            variant="outline"
            value={view}
            onValueChange={(next) => {
              if (isEventsView(next)) selectView(next);
            }}
            aria-label="Events view"
          >
            <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
            <ToggleGroupItem value="board">Board</ToggleGroupItem>
            <ToggleGroupItem value="upcoming">Upcoming</ToggleGroupItem>
          </ToggleGroup>
          <Button asChild>
            <Link href="/dashboard/events/new">Create event</Link>
          </Button>
        </div>
      </FilterBar>

      {!rows ? <p className="text-sm text-muted-foreground">Loading events...</p> : null}
      {result?.truncated && serverWindow ? (
        <p className="text-sm text-muted-foreground" data-testid="events-window-truncated">
          Showing the first {rows?.length ?? 0} events of {serverWindow.label}. Search or add a filter to see the rest.
        </p>
      ) : null}
      {rows && view === "calendar" ? <EventsCalendarView events={rows} /> : null}
      {rows && view === "board" ? <EventsBoardView events={rows} /> : null}
      {rows && view === "upcoming" ? <EventsUpcomingView events={rows} /> : null}
    </div>
  );
}
