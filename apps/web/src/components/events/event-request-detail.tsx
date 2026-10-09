"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  ClockIcon,
  MapPinIcon,
  NotepadIcon,
  PackageIcon,
  ReceiptIcon,
  TrashIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BOOKING_DECLINE_REASON_CODES, bookingDeclineReasonLabel } from "@arbor/format";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { CommentsSection } from "@/components/comments/comments-section";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSessionViewer } from "@/components/session-shell-provider";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { eventRequestStatusLabel, eventRequestStatusTone } from "@/lib/event-request-status";
import { notify } from "@/lib/notify";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Icon } from "@phosphor-icons/react";

type DeclineReasonCode = (typeof BOOKING_DECLINE_REASON_CODES)[number]["code"];

const LINK_PILL =
  "inline-flex min-h-7 items-center gap-1.5 border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground";

function sentenceCase(value: string) {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | number | null;
  children?: React.ReactNode;
}) {
  if (children === undefined && (value === undefined || value === null || value === "")) return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-wrap">{children ?? value}</dd>
    </div>
  );
}

function DetailSection({
  icon: SectionIcon,
  title,
  testId,
  children,
}: {
  icon: Icon;
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SectionIcon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">{children}</dl>
      </CardContent>
    </Card>
  );
}

export function EventRequestDetailClient({ requestId }: { requestId: Id<"eventRequests"> }) {
  const request = useQuery(api.eventRequests.get, { id: requestId });

  if (request === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (request === null) {
    return (
      <div className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Request not found. It may have been deleted.{" "}
        <Link href="/dashboard/ops-center/requests" className="underline underline-offset-2">
          Back to requests
        </Link>
      </div>
    );
  }
  return <EventRequestDetail request={request} />;
}

type EventRequest = NonNullable<ReturnType<typeof useQuery<typeof api.eventRequests.get>>>;

function EventRequestDetail({ request }: { request: EventRequest }) {
  const requestId = request._id;
  const router = useRouter();
  const viewer = useSessionViewer();
  const isAdmin = viewer?.isAdmin ?? false;
  const linkedInvoice = useQuery(
    api.invoices.get,
    request.linkedInvoiceId ? { id: request.linkedInvoiceId } : "skip",
  );
  const managers = useQuery(api.invoices.listManagers, {});
  const convertToEvent = useMutation(api.eventRequests.convertToEvent);
  const updateStatus = useMutation(api.eventRequests.updateStatus);
  const setAssignee = useMutation(api.eventRequests.setAssignee);
  const setStaffNotes = useMutation(api.eventRequests.setStaffNotes);
  const deleteRequestAdmin = useMutation(api.adminDeletes.deleteRequestAdmin);

  const [staffNotes, setStaffNotesDraft] = useState(request.staffNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deletePreview = useQuery(
    api.adminDeletes.previewRequestDeletion,
    deleteOpen ? { id: requestId } : "skip",
  );

  const assigneeOptions: UserSelectOption[] = useMemo(
    () =>
      assignableCrewSelectOptions(
        (managers ?? []).map((row) => ({
          ...row,
          name: row.name?.trim() || row.email || row.id,
        })),
      ),
    [managers],
  );

  const status = request.status;
  const isOpen = status !== "converted" && status !== "declined";
  const notesDirty = staffNotes.trim() !== (request.staffNotes ?? "").trim();
  const trackHref = request.publicToken ? `/request/track/${request.publicToken}` : null;
  const quoteHref = request.linkedInvoiceId
    ? `/dashboard/ops-center/invoices/${request.linkedInvoiceId}`
    : null;
  const events =
    request.convertedEvents.length > 0
      ? request.convertedEvents
      : request.convertedEventId
        ? [{ id: request.convertedEventId, title: request.eventName ?? "Event", startAt: undefined }]
        : [];

  async function attempt(action: () => Promise<unknown>, success?: string) {
    setSaving(true);
    try {
      await action();
      if (success) notify.success(success);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert() {
    setSaving(true);
    try {
      const result = await convertToEvent({ id: requestId });
      router.push(`/dashboard/ops-center/invoices/${result.invoiceId}`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      setSaving(false);
    }
  }

  function handleMarkActionRequired() {
    void attempt(
      () =>
        updateStatus({
          id: requestId,
          status: "action_required",
          staffNotes: staffNotes.trim() || undefined,
        }),
      "Marked action required.",
    );
  }

  async function handleDecline(reasonCode: DeclineReasonCode, reasonNote: string) {
    return attempt(
      () =>
        updateStatus({
          id: requestId,
          status: "declined",
          staffNotes: staffNotes.trim() || undefined,
          declineReasonCode: reasonCode,
          declineReasonNote: reasonNote.trim() || undefined,
        }),
      "Request declined.",
    );
  }

  const needsQuote = status === "submitted" || status === "action_required" || status === "in_review";
  let primaryAction: React.ReactNode = null;
  if (needsQuote && quoteHref) {
    primaryAction = (
      <Button asChild size="sm">
        <Link href={quoteHref}>Open quote</Link>
      </Button>
    );
  } else if (needsQuote) {
    primaryAction = (
      <Button type="button" size="sm" disabled={saving} onClick={() => void handleConvert()}>
        Create quote & tentative event
      </Button>
    );
  } else if (status === "pending_client" && trackHref) {
    primaryAction = (
      <Button asChild size="sm">
        <Link href={trackHref} target="_blank">
          Open client portal
          <ArrowSquareOutIcon className="size-3" aria-hidden />
        </Link>
      </Button>
    );
  } else if (status === "converted" && events[0]) {
    primaryAction = (
      <Button asChild size="sm">
        <Link href={`/dashboard/events/${events[0].id}`}>Open event</Link>
      </Button>
    );
  }

  const showPortalInMenu = trackHref && status !== "pending_client";
  const menu =
    isOpen || showPortalInMenu || isAdmin ? (
      <>
        {showPortalInMenu ? (
          <DropdownMenuItem asChild>
            <Link href={trackHref} target="_blank">
              <ArrowSquareOutIcon />
              Open client portal
            </Link>
          </DropdownMenuItem>
        ) : null}
        {status === "submitted" ? (
          <DropdownMenuItem disabled={saving} onSelect={handleMarkActionRequired}>
            <WarningIcon />
            Mark action required
          </DropdownMenuItem>
        ) : null}
        {(isOpen || isAdmin) && (showPortalInMenu || status === "submitted") ? (
          <DropdownMenuSeparator />
        ) : null}
        {isOpen ? (
          <DropdownMenuItem variant="destructive" disabled={saving} onSelect={() => setDeclineOpen(true)}>
            <XIcon />
            Decline request
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <TrashIcon />
            Delete request
          </DropdownMenuItem>
        ) : null}
      </>
    ) : null;

  const description = (() => {
    switch (status) {
      case "submitted":
        return "Review the request, then create a quote and tentative event, or decline it.";
      case "action_required":
      case "in_review":
        return quoteHref
          ? "Build the quote, then use “Send quote to client” in the quote editor. The client approves on their request portal link; the status becomes Pending once it's sent and Converted when they approve."
          : "Create a quote and tentative event when you're ready, or decline the request.";
      case "pending_client":
        return "The quote is on the client's request portal, waiting for their response.";
      case "converted":
        return "The client approved the quote. The request is closed; follow up on the event.";
      case "declined":
        return "This request was declined and is closed.";
      default:
        return undefined;
    }
  })();

  const eventDateLabel = request.eventStartAtMs
    ? formatDate(request.eventStartAtMs)
    : request.eventDateText;
  const assigneeName = request.assigneeUserId
    ? (assigneeOptions.find((option) => option.value === request.assigneeUserId)?.label ??
      request.assigneeName)
    : null;
  const schedule =
    request.eventScheduleText ||
    [request.eventStartTimeText, request.eventEndTimeText].filter(Boolean).join(" – ");
  const flexibleSetup =
    request.flexibleSetupTime === true ? "Yes" : request.flexibleSetupTime === false ? "No" : undefined;

  return (
    <div className="space-y-4 pb-24" data-testid="event-request-detail">
      <PageHeader
        back={{ href: "/dashboard/ops-center/requests", label: "Requests" }}
        actions={primaryAction}
        menuLabel="More request actions"
        menu={menu}
        pills={
          <>
            <StatusPill tone={eventRequestStatusTone(status)}>
              <span data-testid="request-status">{eventRequestStatusLabel(status)}</span>
            </StatusPill>
            <span className="text-xs text-muted-foreground tabular-nums">{request.requestNumber}</span>
            {quoteHref ? (
              <Link href={quoteHref} className={LINK_PILL} data-testid="request-quote-link">
                <ReceiptIcon className="size-3.5" aria-hidden />
                {linkedInvoice
                  ? `Quote ${linkedInvoice.invoice.invoiceNumber} · ${sentenceCase(linkedInvoice.invoice.status)}${
                      linkedInvoice.invoice.clientReviewReadyAt ? " · On request portal" : ""
                    }`
                  : "Quote"}
              </Link>
            ) : null}
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/dashboard/events/${event.id}`}
                className={LINK_PILL}
                data-testid="request-event-link"
              >
                <CalendarDotsIcon className="size-3.5" aria-hidden />
                {event.startAt ? `Event · ${formatDate(event.startAt)}` : "Event"}
              </Link>
            ))}
          </>
        }
        title={`${request.firstName} ${request.lastName}`}
        description={description}
        meta={
          <>
            <MetaItem icon={CalendarBlankIcon}>{eventDateLabel}</MetaItem>
            {request.venueName ? <MetaItem icon={MapPinIcon}>{request.venueName}</MetaItem> : null}
            <MetaItem icon={UsersThreeIcon}>{request.expectedTurnout.toLocaleString()} expected</MetaItem>
            <MetaItem icon={UserCircleIcon}>
              {assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}
            </MetaItem>
            <MetaItem icon={ClockIcon}>Submitted {formatDateTime(request.submittedAt)}</MetaItem>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <DetailSection icon={UserCircleIcon} title="Contact" testId="request-contact">
            <DetailRow label="Name" value={`${request.firstName} ${request.lastName}`} />
            <DetailRow label="Email">
              <a href={`mailto:${request.email}`} className="underline-offset-2 hover:underline">
                {request.email}
              </a>
            </DetailRow>
            {request.phone ? (
              <DetailRow label="Phone">
                <a href={`tel:${request.phone}`} className="underline-offset-2 hover:underline">
                  {request.phone}
                </a>
              </DetailRow>
            ) : null}
            <DetailRow label="Organization" value={request.organization} />
            <DetailRow label="Sponsor type" value={request.sponsorType} />
          </DetailSection>

          <DetailSection icon={CalendarDotsIcon} title="Event" testId="request-event">
            <DetailRow label="Event name" value={request.eventName} />
            <DetailRow label="Category" value={request.eventCategory} />
            <DetailRow label="Date" value={request.eventDateText} />
            <DetailRow label="Schedule" value={schedule} />
            <DetailRow label="Venue" value={request.venueName} />
            <DetailRow label="Venue address" value={request.venueAddress} />
            <DetailRow label="Expected turnout" value={request.expectedTurnout.toLocaleString()} />
            <DetailRow label="Description" value={request.eventDescription} />
          </DetailSection>

          <DetailSection icon={PackageIcon} title="Production" testId="request-production">
            <DetailRow label="Services" value={request.servicesNeeded.join("\n")} />
            <DetailRow label="Production tier" value={request.productionTier} />
            <DetailRow label="Existing equipment" value={request.existingEquipment} />
            <DetailRow label="Lighting" value={request.lightingPreference} />
            <DetailRow label="Earliest setup" value={request.earliestSetupText} />
            <DetailRow label="Flexible setup" value={flexibleSetup} />
          </DetailSection>

          <Card data-testid="request-notes">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotepadIcon className="size-4 text-muted-foreground" aria-hidden />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="divide-y">
                <DetailRow label="From the client" value={request.additionalNotes} />
                {status === "declined" && request.declineReasonCode ? (
                  <DetailRow
                    label="Decline reason"
                    value={`${bookingDeclineReasonLabel(request.declineReasonCode)}${
                      request.declineReasonNote ? ` — ${request.declineReasonNote}` : ""
                    }`}
                  />
                ) : null}
              </dl>
              <div className="space-y-2">
                <Label htmlFor="request-staff-notes">Staff notes</Label>
                <Textarea
                  id="request-staff-notes"
                  value={staffNotes}
                  onChange={(event) => setStaffNotesDraft(event.target.value)}
                  placeholder="Internal notes (optional)"
                  className="min-h-24"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Only staff see these.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!notesDirty || saving}
                    onClick={() =>
                      void attempt(
                        () => setStaffNotes({ id: requestId, staffNotes: staffNotes.trim() || undefined }),
                        "Staff notes saved.",
                      )
                    }
                  >
                    Save notes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircleIcon className="size-4 text-muted-foreground" aria-hidden />
                Assignee
              </CardTitle>
            </CardHeader>
            <CardContent data-testid="request-assignee-picker">
              <UserSelect
                value={request.assigneeUserId ?? ""}
                onChange={(value) => {
                  void setAssignee({ id: requestId, assigneeUserId: value || undefined }).catch((error) =>
                    notify.error(getConvexErrorMessage(error)),
                  );
                }}
                options={[{ value: "", label: "Unassigned" }, ...assigneeOptions]}
                placeholder="Unassigned"
                emptyLabel="Unassigned"
              />
            </CardContent>
          </Card>
          <CommentsSection
            subjectType="event_request"
            subjectId={requestId}
            description="Internal discussion on this request — the client never sees it."
          />
        </div>
      </div>

      <DeclineRequestDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        requesterName={`${request.firstName} ${request.lastName}`}
        onDecline={handleDecline}
      />

      <AdminCascadeDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        entityName="booking request"
        preview={deletePreview ?? null}
        onConfirm={async (cascade) => {
          await deleteRequestAdmin({ id: requestId, cascade });
          router.push("/dashboard/ops-center/requests");
        }}
      />
    </div>
  );
}

function DeclineRequestDialog({
  open,
  onOpenChange,
  requesterName,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requesterName: string;
  onDecline: (reasonCode: DeclineReasonCode, reasonNote: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="decline-request-dialog">
        {open ? (
          <DeclineRequestForm
            requesterName={requesterName}
            onCancel={() => onOpenChange(false)}
            onDecline={async (code, note) => {
              if (await onDecline(code, note)) onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeclineRequestForm({
  requesterName,
  onCancel,
  onDecline,
}: {
  requesterName: string;
  onCancel: () => void;
  onDecline: (reasonCode: DeclineReasonCode, reasonNote: string) => Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reasonCode) {
      setError("Select a decline reason.");
      return;
    }
    setError(null);
    setSubmitting(true);
    await onDecline(reasonCode as DeclineReasonCode, reasonNote);
    setSubmitting(false);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Decline {requesterName}&apos;s request?</DialogTitle>
        <DialogDescription>
          The request closes and the client is emailed that it was declined. The reason is for the
          team; the client doesn&apos;t see it.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Decline reason</Label>
          <div data-testid="decline-reason-picker">
            <SearchableSelect
              value={reasonCode}
              onChange={(value) => {
                setReasonCode(value);
                setError(null);
              }}
              options={BOOKING_DECLINE_REASON_CODES.map((reason) => ({
                value: reason.code,
                label: reason.label,
              }))}
              placeholder="Search reasons…"
              emptyLabel="Select a reason…"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="decline-reason-note">Decline note (optional)</Label>
          <Input
            id="decline-reason-note"
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
            placeholder="Extra context for the team"
          />
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={submitting}
          onClick={() => void submit()}
        >
          Decline request
        </Button>
      </DialogFooter>
    </>
  );
}
