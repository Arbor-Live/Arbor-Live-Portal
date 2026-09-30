"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useSessionShell } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { EquipmentBorrowRequestForm } from "@/components/inventory/equipment-borrow-request-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDateTimeRange } from "@/lib/format";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";

type BorrowLine = {
  label: string;
  quantity: number;
};

type BorrowRequest = {
  _id: Id<"equipmentBorrowRequests">;
  status: string;
  requestNumber: string;
  requesterUserId: string;
  requesterName: string;
  purpose: string;
  venueName?: string;
  notes?: string;
  startAt: number;
  endAt: number;
  lines: BorrowLine[];
  reviewNote?: string;
  convertedEventId?: Id<"events">;
};

function formatStatusLabel(status: string) {
  switch (status) {
    case "submitted":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Not approved";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "submitted":
      return "border border-status-amber-500/30 bg-status-amber-500/10 text-status-amber-700";
    case "approved":
      return "border border-status-emerald-500/30 bg-status-emerald-500/10 text-status-emerald-700";
    case "rejected":
      return "border border-status-rose-500/30 bg-status-rose-500/10 text-status-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

type BorrowStatus = "submitted" | "approved" | "rejected" | "cancelled";

const STATUS_OPTIONS = (["submitted", "approved", "rejected", "cancelled"] as const).map((value) => ({
  value,
  label: formatStatusLabel(value),
}));

const WHEN_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "now", label: "Happening now" },
  { value: "past", label: "Past" },
];

/** True when the filters are just the default review queue. */
function isReviewQueue(filters: FilterState) {
  const applied = activeFilters(filters);
  const keys = Object.keys(applied);
  return (
    keys.length === 1 &&
    applied.status?.operator === "is" &&
    applied.status.values.length === 1 &&
    applied.status.values[0] === "submitted"
  );
}

function equipmentSummary(lines: BorrowLine[]) {
  if (lines.length === 0) return "No equipment";
  return lines.map((line) => `${line.quantity}× ${line.label}`).join(", ");
}

function RequestCard({
  request,
  footer,
}: {
  request: BorrowRequest;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            <span className="text-muted-foreground">{request.requestNumber} · </span>
            {request.purpose}
          </p>
          <p className="text-xs text-muted-foreground">
            {request.requesterName} · {formatDateTimeRange(request.startAt, request.endAt)}
          </p>
          {request.venueName ? (
            <p className="text-xs text-muted-foreground">Venue: {request.venueName}</p>
          ) : null}
          <p className="mt-1 text-sm">{equipmentSummary(request.lines)}</p>
          {request.notes ? (
            <p className="mt-1 text-xs text-muted-foreground">{request.notes}</p>
          ) : null}
          {request.reviewNote ? (
            <p className="mt-1 text-xs text-muted-foreground">Note: {request.reviewNote}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${statusBadgeClass(request.status)}`}>
              {formatStatusLabel(request.status)}
            </span>
          </div>
        </div>
        {request.convertedEventId ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/events/${request.convertedEventId}`}>View event</Link>
          </Button>
        ) : null}
      </div>
      {footer}
    </div>
  );
}

function ReviewCard({ request }: { request: BorrowRequest }) {
  const approve = useMutation(api.equipmentBorrowRequests.approve);
  const reject = useMutation(api.equipmentBorrowRequests.reject);
  const dialog = useAppDialog();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function handleApprove() {
    setBusy("approve");
    try {
      await approve({ id: request._id, reviewNote: note.trim() || undefined });
      notify.success("Borrow request approved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to approve the borrow request."));
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    const confirmed = await dialog.confirm({
      title: "Reject this borrow request?",
      description: `${request.requestNumber} — ${request.purpose}`,
      destructive: true,
      confirmLabel: "Reject",
    });
    if (!confirmed) return;
    setBusy("reject");
    try {
      await reject({ id: request._id, reviewNote: note.trim() || undefined });
      notify.success("Borrow request rejected.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to reject the borrow request."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <RequestCard
      request={request}
      footer={
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="min-w-48 flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
            aria-label="Review note"
            placeholder="Optional note for the requester"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy !== null}
            onClick={() => void handleApprove()}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void handleReject()}
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      }
    />
  );
}

function CancelButton({ request }: { request: BorrowRequest }) {
  const cancel = useMutation(api.equipmentBorrowRequests.cancel);
  const dialog = useAppDialog();
  const [busy, setBusy] = useState(false);

  if (request.status !== "submitted") return null;

  async function handleCancel() {
    const confirmed = await dialog.confirm({
      title: "Cancel this borrow request?",
      description: `${request.requestNumber} — ${request.purpose}`,
      destructive: true,
      confirmLabel: "Cancel request",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await cancel({ id: request._id });
      notify.success("Borrow request cancelled.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to cancel the borrow request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => void handleCancel()}
    >
      {busy ? "Cancelling…" : "Cancel request"}
    </Button>
  );
}

export function EquipmentBorrowRequestsClient() {
  const shell = useSessionShell();
  const isAdmin = shell?.viewer?.isAdmin ?? false;
  const [formOpen, setFormOpen] = useState(false);

  const mine = useQuery(api.equipmentBorrowRequests.listMine);
  const [search, setSearch] = useState("");
  // Starts on the review queue, shown as a chip so it's clear how to widen it.
  const [filters, setFilters] = useState<FilterState>({
    status: { operator: "is", values: ["submitted"] },
  });
  const [nowMs] = useState(() => Date.now());
  const applied = activeFilters(filters);
  // One `is` status reads through the status index; anything else loads the newest requests.
  const serverStatus =
    applied.status?.operator === "is" && applied.status.values.length === 1
      ? (applied.status.values[0] as BorrowStatus)
      : undefined;
  const requests = useQuery(api.equipmentBorrowRequests.list, isAdmin ? { status: serverStatus } : "skip");
  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "status", label: "Status", options: STATUS_OPTIONS },
      {
        id: "requester",
        label: "Requester",
        options: [...new Map((requests ?? []).map((row) => [row.requesterUserId, row.requesterName])).entries()]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      { id: "when", label: "When", options: WHEN_OPTIONS },
    ],
    [requests],
  );
  const queue = useMemo(() => {
    if (!requests) return undefined;
    const needle = search.trim().toLowerCase();
    return requests.filter((request) => {
      const when = request.endAt < nowMs ? "past" : request.startAt > nowMs ? "upcoming" : "now";
      return (
        (!needle ||
          [request.requestNumber, request.purpose, request.requesterName, request.venueName, request.notes]
            .concat(request.lines.map((line) => line.label))
            .some((field) => field?.toLowerCase().includes(needle))) &&
        matchesFilter(applied.status, request.status) &&
        matchesFilter(applied.requester, request.requesterUserId) &&
        matchesFilter(applied.when, when)
      );
    });
  }, [applied.requester, applied.status, applied.when, nowMs, requests, search]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setFormOpen(true)}>
          New borrow request
        </Button>
      </div>

      {isAdmin ? (
        <section className="space-y-2" data-testid="borrow-requests-admin">
          <h2 className="text-sm font-semibold">Requests</h2>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search number, purpose, requester, gear…"
            searchLabel="Search borrow requests"
            filters={filterDefinitions}
            value={filters}
            onChange={setFilters}
          />
          {queue === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {isReviewQueue(filters) && !search.trim()
                ? "No borrow requests waiting on review."
                : "No borrow requests match this search and these filters."}
            </p>
          ) : (
            queue.map((request) =>
              request.status === "submitted" ? (
                <ReviewCard key={request._id} request={request} />
              ) : (
                <RequestCard key={request._id} request={request} />
              ),
            )
          )}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">My requests</h2>
        {mine === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            You haven&apos;t requested any equipment yet.
          </p>
        ) : (
          mine.map((request) => (
            <RequestCard
              key={request._id}
              request={request}
              footer={
                <div className="mt-3 flex justify-end">
                  <CancelButton request={request} />
                </div>
              }
            />
          ))
        )}
      </section>

      <EquipmentBorrowRequestForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={() => setFormOpen(false)}
      />
    </div>
  );
}
