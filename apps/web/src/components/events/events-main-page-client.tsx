"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { EventsCalendarView } from "@/components/events/events-calendar-view";
import { EventsUpcomingView } from "@/components/events/events-upcoming-view";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EventStatus = "draft" | "active" | "completed" | "cancelled";
type EventsView = "calendar" | "upcoming";

export function EventsMainPageClient() {
  const [view, setView] = useState<EventsView>("calendar");
  const [status, setStatus] = useState<"" | EventStatus>("");
  const [search, setSearch] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(false);

  const rows = useQuery(api.events.listForDashboard, {
    status: status || undefined,
    query: search || undefined,
    linkedInvoiceOnly: linkedOnly || undefined,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search title, venue, type, host..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="w-[220px]">
          <SearchableSelect
            value={status}
            onChange={(value) => setStatus(value as "" | EventStatus)}
            options={[
              { value: "", label: "All Statuses" },
              { value: "draft", label: "Draft" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            placeholder="Search status..."
            emptyLabel="All statuses"
          />
        </div>
        <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
          <input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />
          Linked invoice only
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant={view === "calendar" ? "default" : "outline"} onClick={() => setView("calendar")}>
            Calendar View
          </Button>
          <Button type="button" variant={view === "upcoming" ? "default" : "outline"} onClick={() => setView("upcoming")}>
            Upcoming View
          </Button>
          <Button asChild>
            <Link href="/dashboard/events/new">Create Event</Link>
          </Button>
        </div>
      </div>

      {!rows ? <p className="text-sm text-muted-foreground">Loading events...</p> : null}
      {rows && view === "calendar" ? <EventsCalendarView events={rows} /> : null}
      {rows && view === "upcoming" ? <EventsUpcomingView events={rows} /> : null}
    </div>
  );
}
