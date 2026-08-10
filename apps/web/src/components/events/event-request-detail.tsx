"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BOOKING_DECLINE_REASON_CODES, bookingDeclineReasonLabel } from "@arbor/format";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { CommentsSection } from "@/components/comments/comments-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSessionViewer } from "@/components/session-shell-provider";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { buildUserSelectDescription } from "@/lib/user-select-description";
import { formatDate, formatDateTime } from "@/lib/format";

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid gap-1 border-b py-3 sm:grid-cols-[180px_1fr]">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export function EventRequestDetailClient({ requestId }: { requestId: Id<"eventRequests"> }) {
  const router = useRouter();
  const viewer = useSessionViewer();
  const request = useQuery(api.eventRequests.get, { id: requestId });
  const linkedInvoice = useQuery(
    api.invoices.get,
    request?.linkedInvoiceId ? { id: request.linkedInvoiceId } : "skip",
  );
  const convertToEvent = useMutation(api.eventRequests.convertToEvent);
  const updateStatus = useMutation(api.eventRequests.updateStatus);
  const setAssignee = useMutation(api.eventRequests.setAssignee);
  const managers = useQuery(api.invoices.listManagers, {});
  const deleteRequestAdmin = useMutation(api.adminDeletes.deleteRequestAdmin);
  const [staffNotes, setStaffNotes] = useState("");
  const [declineReasonCode, setDeclineReasonCode] = useState("");
  const [declineReasonNote, setDeclineReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deletePreview = useQuery(
    api.adminDeletes.previewRequestDeletion,
    deleteOpen ? { id: requestId } : "skip",
  );
  const isAdmin = viewer?.isAdmin ?? false;

  const assigneeOptions: UserSelectOption[] = useMemo(
    () =>
      (managers ?? []).map((row) => ({
        value: row.id,
        label: row.name?.trim() || row.email || row.id,
        description: buildUserSelectDescription(row),
      })),
    [managers],
  );

  if (request === undefined) {
    return <p className="text-sm text-muted-foreground">Loading request...</p>;
  }
  if (request === null) {
    return <p className="text-sm text-destructive">Request not found.</p>;
  }

  async function handleDecline() {
    if (!declineReasonCode) {
      setError("Select a decline reason.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateStatus({
        id: requestId,
        status: "declined",
        staffNotes: staffNotes.trim() || undefined,
        declineReasonCode: declineReasonCode as (typeof BOOKING_DECLINE_REASON_CODES)[number]["code"],
        declineReasonNote: declineReasonNote.trim() || undefined,
      });
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkInReview() {
    setSaving(true);
    setError(null);
    try {
      await updateStatus({
        id: requestId,
        status: "in_review",
        staffNotes: staffNotes.trim() || undefined,
      });
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert() {
    setSaving(true);
    setError(null);
    try {
      const result = await convertToEvent({ id: requestId });
      router.push(`/dashboard/financial-hub/invoices/${result.invoiceId}`);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Failed to create quote and event.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/events/requests">Back to requests</Link>
        </Button>
        {request.publicToken ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/request/track/${request.publicToken}`} target="_blank">
              Client request portal
            </Link>
          </Button>
        ) : null}
        {request.linkedInvoiceId ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/financial-hub/invoices/${request.linkedInvoiceId}`}>Open quote</Link>
          </Button>
        ) : null}
        {request.convertedEvents.length > 0 ? (
          request.convertedEvents.map((event) => (
            <Button asChild key={event.id} size="sm" variant={request.convertedEvents.length > 1 ? "outline" : "default"}>
              <Link href={`/dashboard/events/${event.id}`}>
                {request.convertedEvents.length > 1
                  ? `Open event · ${formatDate(event.startAt)}`
                  : "Open tentative event"}
              </Link>
            </Button>
          ))
        ) : request.convertedEventId ? (
          <Button asChild size="sm">
            <Link href={`/dashboard/events/${request.convertedEventId}`}>Open tentative event</Link>
          </Button>
        ) : null}
        {isAdmin ? (
          <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete request
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {request.status === "converted" ? (
        <Alert>
          <AlertDescription>
            Build the quote, then use &quot;Send quote to client&quot; in the quote editor. The client
            will review and approve on their request portal link — no separate approval URL is needed.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border p-4">
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-0.5">{request.requestNumber ?? request._id}</span>
          <span className="rounded bg-muted px-2 py-0.5 capitalize">
            {request.status.replace("_", " ")}
          </span>
          <span className="rounded bg-muted px-2 py-0.5">
            Submitted {formatDateTime(request.submittedAt)}
          </span>
          {linkedInvoice ? (
            <span className="rounded bg-muted px-2 py-0.5">
              Quote {linkedInvoice.invoice.invoiceNumber} ·{" "}
              <span className="capitalize">
                {linkedInvoice.invoice.status.replace("_", " ")}
              </span>
              {linkedInvoice.invoice.clientReviewReadyAt ? " · On request portal" : ""}
            </span>
          ) : null}
        </div>

        <DetailRow label="Name" value={`${request.firstName} ${request.lastName}`} />
        <DetailRow label="Email" value={request.email} />
        <DetailRow label="Phone" value={request.phone} />
        <div className="grid gap-1 border-b py-3 sm:grid-cols-[180px_1fr]">
          <p className="text-sm font-medium text-muted-foreground">Assignee</p>
          <div className="max-w-md">
            <UserSelect
              value={request.assigneeUserId ?? ""}
              onChange={(value) => {
                void setAssignee({
                  id: requestId,
                  assigneeUserId: value || undefined,
                }).catch((assignError) => {
                  setError(
                    assignError instanceof Error ? assignError.message : "Failed to update assignee.",
                  );
                });
              }}
              options={[{ value: "", label: "Unassigned" }, ...assigneeOptions]}
              placeholder="Unassigned"
              emptyLabel="Unassigned"
            />
          </div>
        </div>
        <DetailRow label="Organization" value={request.organization} />
        <DetailRow label="Sponsor type" value={request.sponsorType} />
        <DetailRow label="Venue" value={request.venueName} />
        {request.venueAddress ? (
          <DetailRow label="Venue address" value={request.venueAddress} />
        ) : null}
        <DetailRow label="Venue address" value={request.venueAddress} />
        <DetailRow label="Event date" value={request.eventDateText} />
        {request.eventScheduleText ? (
          <DetailRow label="Show schedule" value={request.eventScheduleText} />
        ) : (
          <>
            <DetailRow label="Start time" value={request.eventStartTimeText} />
            <DetailRow label="End time" value={request.eventEndTimeText} />
          </>
        )}
        <DetailRow label="Earliest setup" value={request.earliestSetupText} />
        <DetailRow
          label="Flexible setup"
          value={request.flexibleSetupTime ? "Yes" : request.flexibleSetupTime === false ? "No" : undefined}
        />
        <DetailRow label="Event name" value={request.eventName} />
        <DetailRow label="Event category" value={request.eventCategory} />
        <DetailRow label="Services" value={request.servicesNeeded.join("\n")} />
        <DetailRow label="Production tier" value={request.productionTier} />
        <DetailRow label="Description" value={request.eventDescription} />
        <DetailRow label="Expected turnout" value={request.expectedTurnout} />
        <DetailRow label="Existing equipment" value={request.existingEquipment} />
        <DetailRow label="Lighting" value={request.lightingPreference} />
        <DetailRow label="Additional notes" value={request.additionalNotes} />
        <DetailRow label="Staff notes" value={request.staffNotes} />
        {request.status === "declined" && request.declineReasonCode ? (
          <DetailRow
            label="Decline reason"
            value={`${bookingDeclineReasonLabel(request.declineReasonCode)}${
              request.declineReasonNote ? ` — ${request.declineReasonNote}` : ""
            }`}
          />
        ) : null}
      </div>

      <CommentsSection
        subjectType="event_request"
        subjectId={requestId}
        description={
          <>
            Internal discussion on this request — the client never sees it. Type{" "}
            <span className="font-medium">@</span> to mention a teammate.
          </>
        }
      />

      {request.status !== "converted" && request.status !== "declined" ? (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Staff actions</p>
          <textarea
            value={staffNotes}
            onChange={(event) => setStaffNotes(event.target.value)}
            placeholder="Internal notes (optional)"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Decline reason</span>
              <select
                value={declineReasonCode}
                onChange={(event) => setDeclineReasonCode(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a reason…</option>
                {BOOKING_DECLINE_REASON_CODES.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Decline note (optional)</span>
              <input
                value={declineReasonNote}
                onChange={(event) => setDeclineReasonNote(event.target.value)}
                placeholder="Extra context for the team"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {request.status === "submitted" ? (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleMarkInReview()}>
                Mark in review
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={saving} onClick={() => void handleDecline()}>
              Decline
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleConvert()}>
              Create quote & tentative event
            </Button>
          </div>
        </div>
      ) : null}

      <AdminCascadeDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        entityName="booking request"
        preview={deletePreview ?? null}
        onConfirm={async (cascade) => {
          await deleteRequestAdmin({ id: requestId, cascade });
          router.push("/dashboard/events/requests");
        }}
      />
    </div>
  );
}
