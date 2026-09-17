"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useSessionShell } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { EquipmentBorrowRequestForm } from "@/components/inventory/equipment-borrow-request-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDateTimeRange } from "@/lib/format";

type BorrowLine = {
  label: string;
  quantity: number;
};

type BorrowRequest = {
  _id: Id<"equipmentBorrowRequests">;
  status: string;
  requestNumber: string;
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
      return "border border-amber-500/30 bg-amber-500/10 text-amber-700";
    case "approved":
      return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "rejected":
      return "border border-rose-500/30 bg-rose-500/10 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
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
  const queue = useQuery(
    api.equipmentBorrowRequests.list,
    isAdmin ? { status: "submitted" as const } : "skip",
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setFormOpen(true)}>
          New borrow request
        </Button>
      </div>

      {isAdmin ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Review queue</h2>
          {queue === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No borrow requests waiting on review.
            </p>
          ) : (
            queue.map((request) => (
              <ReviewCard key={request._id} request={request} />
            ))
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
