"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EventStatus = "draft" | "active" | "completed" | "cancelled";

export function EventsListClient() {
  const [status, setStatus] = useState<"" | EventStatus>("");
  const [search, setSearch] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(false);

  const rows = useQuery(api.events.list, {
    status: status || undefined,
    query: search || undefined,
    linkedInvoiceOnly: linkedOnly || undefined,
  });
  const duplicateEvent = useMutation(api.events.duplicate);
  const setEventStatus = useMutation(api.events.setStatus);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search title, venue, type, host..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="w-[220px]">
          <SearchableSelect
            value={status}
            onChange={(value) => setStatus(value as "" | EventStatus)}
            options={[
              { value: "", label: "All statuses" },
              { value: "draft", label: "draft" },
              { value: "active", label: "active" },
              { value: "completed", label: "completed" },
              { value: "cancelled", label: "cancelled" },
            ]}
            placeholder="Search status..."
            emptyLabel="All statuses"
          />
        </div>
        <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
          <input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />
          Linked invoice only
        </label>
        <Button asChild className="ml-auto">
          <Link href="/dashboard/events/new">Create Event</Link>
        </Button>
      </div>

      <div className="space-y-2">
        {(rows ?? []).map((row) => (
          <div key={row._id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.startAt).toLocaleString()} {"->"} {new Date(row.endAt).toLocaleString()}
                </p>
                <div className="mt-1 flex gap-2 text-xs">
                  <span className="rounded bg-muted px-2 py-0.5">{row.status}</span>
                  {row.eventType ? <span className="rounded bg-muted px-2 py-0.5">{row.eventType}</span> : null}
                  {(row.teamsInterested ?? []).map((team) => (
                    <span key={`${row._id}-${team}`} className="rounded bg-muted px-2 py-0.5">
                      {team}
                    </span>
                  ))}
                  {row.venueName ? <span className="rounded bg-muted px-2 py-0.5">{row.venueName}</span> : null}
                  {row.invoiceId ? <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">linked invoice</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link href={`/dashboard/events/${row._id}`}>Open</Link>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void duplicateEvent({ id: row._id })}>
                  Duplicate
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void setEventStatus({ id: row._id, status: row.status === "cancelled" ? "draft" : "cancelled" })}>
                  {row.status === "cancelled" ? "Restore" : "Cancel"}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!rows?.length ? <p className="text-sm text-muted-foreground">No events found.</p> : null}
    </div>
  );
}
