"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { formatDateTime } from "@/lib/format";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In review" },
  { value: "converted", label: "Converted" },
  { value: "declined", label: "Declined" },
] as const;

function formatStatusLabel(status: string) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "in_review":
      return "In review";
    case "converted":
      return "Converted";
    case "declined":
      return "Declined";
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "submitted":
    case "in_review":
      return "border border-amber-500/30 bg-amber-500/10 text-amber-700";
    case "converted":
      return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "declined":
      return "border border-rose-500/30 bg-rose-500/10 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function EventRequestsInbox() {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("");
  const rows = useQuery(api.eventRequests.list, {
    status: status || undefined,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[220px]">
          <SearchableSelect
            value={status}
            onChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])}
            options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="Filter status..."
            emptyLabel="All statuses"
          />
        </div>
        <Button asChild className="ml-auto">
          <Link href="/request" target="_blank">
            Open public form
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {(rows ?? []).map((row) => (
          <div key={row._id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {row.requestNumber ? `${row.requestNumber} · ` : ""}
                  {row.firstName} {row.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.email} · {row.phone}
                </p>
                <p className="mt-1 text-sm">
                  {row.eventName ? (
                    <>
                      <span className="font-medium">{row.eventName}</span>
                      <span className="text-muted-foreground"> · {row.eventCategory}</span>
                    </>
                  ) : (
                    row.eventCategory
                  )}
                  {row.venueName ? ` · ${row.venueName}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">Event date: {row.eventDateText}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${statusBadgeClass(row.status)}`}>
                    {formatStatusLabel(row.status)}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5">Turnout: {row.expectedTurnout}</span>
                  <span className="rounded bg-muted px-2 py-0.5">{row.sponsorType}</span>
                  {row.organization ? (
                    <span className="rounded bg-muted px-2 py-0.5">{row.organization}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link href={`/dashboard/events/requests/${row._id}`}>Open</Link>
                </Button>
                {row.convertedEventIds && row.convertedEventIds.length > 0 ? (
                  row.convertedEventIds.length > 1 ? (
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/dashboard/events/requests/${row._id}`}>
                        View {row.convertedEventIds.length} events
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/dashboard/events/${row.convertedEventIds[0]}`}>View event</Link>
                    </Button>
                  )
                ) : row.convertedEventId ? (
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/dashboard/events/${row.convertedEventId}`}>View event</Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Submitted {formatDateTime(row.submittedAt)}
            </p>
          </div>
        ))}
        {rows && rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No booking requests yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
