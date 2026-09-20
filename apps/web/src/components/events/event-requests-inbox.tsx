"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { formatDateTime, pacificDateKey } from "@/lib/format";

const REQUESTS_BASE = "/dashboard/financial-hub/requests";

const STATUS_OPTIONS = [
  { value: "", label: "Open (hide completed)" },
  { value: "submitted", label: "Submitted" },
  { value: "action_required", label: "Action required" },
  { value: "pending_client", label: "Pending" },
  { value: "converted", label: "Converted" },
  { value: "declined", label: "Declined" },
  { value: "all", label: "All statuses" },
] as const;

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
  assigneeName: string | null;
  convertedEventId?: string;
  convertedEventIds?: string[];
};

function formatStatusLabel(status: string) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "action_required":
    case "in_review":
      return "Action required";
    case "pending_client":
      return "Pending";
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
    case "action_required":
    case "in_review":
      return "border border-status-amber-500/30 bg-status-amber-500/10 text-status-amber-700";
    case "pending_client":
      return "border border-status-sky-500/30 bg-status-sky-500/10 text-status-sky-700";
    case "converted":
      return "border border-status-emerald-500/30 bg-status-emerald-500/10 text-status-emerald-700";
    case "declined":
      return "border border-status-rose-500/30 bg-status-rose-500/10 text-status-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

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

function RequestCard({ row }: { row: RequestRow }) {
  const ago = daysAgoLabel(row.submittedAt);
  return (
    <div className="rounded-md border p-3">
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
            <span className="rounded bg-muted px-2 py-0.5">
              Assignee: {row.assigneeName ?? "Unassigned"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`${REQUESTS_BASE}/${row._id}`}>Open</Link>
          </Button>
          {row.convertedEventIds && row.convertedEventIds.length > 0 ? (
            row.convertedEventIds.length > 1 ? (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`${REQUESTS_BASE}/${row._id}`}>
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
        {ago ? ` · ${ago}` : ""}
      </p>
    </div>
  );
}

export function EventRequestsInbox() {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("");
  const [pendingOpen, setPendingOpen] = useState(false);
  const rows = useQuery(api.eventRequests.list, {
    status: status && status !== "all" ? status : undefined,
    includeTerminal: status === "all" || status === "converted" || status === "declined",
  });

  const isDefaultOpenView = status === "";
  const followUpRows =
    rows?.filter((row) => row.status !== "pending_client") ?? [];
  const pendingClientRows =
    isDefaultOpenView ? (rows?.filter((row) => row.status === "pending_client") ?? []) : [];
  const visibleRows = isDefaultOpenView ? followUpRows : (rows ?? []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[260px]">
          <SearchableSelect
            value={status}
            onChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])}
            options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="Filter status..."
            emptyLabel="Open (hide completed)"
          />
        </div>
        <Button asChild className="ml-auto" variant="outline">
          <Link href={`${REQUESTS_BASE}/settings`}>Round-robin settings</Link>
        </Button>
        <Button asChild>
          <Link href="/request" target="_blank">
            Open public form
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {visibleRows.map((row) => (
          <RequestCard key={row._id} row={row} />
        ))}
        {rows && visibleRows.length === 0 && pendingClientRows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No open booking requests.
          </p>
        ) : null}
        {isDefaultOpenView && pendingClientRows.length > 0 ? (
          <Collapsible open={pendingOpen} onOpenChange={setPendingOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40">
              <CaretRightIcon
                className={`size-3.5 shrink-0 transition-transform ${pendingOpen ? "rotate-90" : ""}`}
              />
              <span>
                Pending client response ({pendingClientRows.length})
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {pendingClientRows.map((row) => (
                <RequestCard key={row._id} row={row} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </div>
  );
}
