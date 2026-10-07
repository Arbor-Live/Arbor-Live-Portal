"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowSquareOutIcon, PlusIcon, WarningIcon } from "@phosphor-icons/react";
import {
  activeFilters,
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowMenu,
  RowText,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { PageHeader, PageTabs, StatusPill, type Tone } from "@/components/page-header";
import { EquipmentBorrowRequestForm } from "@/components/inventory/equipment-borrow-request-form";
import { useSessionShell } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSheetParam } from "@/hooks/use-sheet-param";
import {
  BORROW_REQUEST_TAB_ICONS,
  BORROW_REQUEST_TAB_LABELS,
  BORROW_REQUEST_TABS,
  borrowRequestTabFromParam,
  borrowRequestTabHref,
  type BorrowRequestTabId,
} from "@/lib/borrow-request-tabs";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatDateTime, formatDateTimeRange, plural } from "@/lib/format";
import { notify } from "@/lib/notify";

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
  requesterEmail?: string;
  purpose: string;
  venueName?: string;
  notes?: string;
  startAt: number;
  endAt: number;
  lines: BorrowLine[];
  agreement?: {
    version: string;
    terms: Array<{ key: string; text: string }>;
    signedName: string;
    signedEmail: string;
    signedAt: number;
  };
  reviewNote?: string;
  reviewedByUserName?: string;
  reviewedAt?: number;
  convertedEventId?: Id<"events">;
  createdAt: number;
};

type BorrowStatus = "submitted" | "approved" | "rejected" | "cancelled";

const STATUS_LABELS: Record<BorrowStatus, string> = {
  submitted: "Pending review",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

const STATUS_TONES: Record<BorrowStatus, Tone> = {
  submitted: "amber",
  approved: "emerald",
  rejected: "rose",
  cancelled: "neutral",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status as BorrowStatus] ?? status;
}

function statusTone(status: string): Tone {
  return STATUS_TONES[status as BorrowStatus] ?? "neutral";
}

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as BorrowStatus[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

const WHEN_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "now", label: "Happening now" },
  { value: "past", label: "Past" },
];

/** To review starts on the pending queue, shown as a chip so it's clear how to widen it. */
const REVIEW_DEFAULT_FILTERS: FilterState = { status: { operator: "is", values: ["submitted"] } };


function equipmentSummary(lines: BorrowLine[]) {
  if (lines.length === 0) return "No equipment";
  return lines.map((line) => `${line.quantity}× ${line.label}`).join(", ");
}

function whenBucket(request: BorrowRequest, nowMs: number) {
  if (request.endAt < nowMs) return "past";
  if (request.startAt > nowMs) return "upcoming";
  return "now";
}

function matchesSearch(request: BorrowRequest, needle: string) {
  if (!needle) return true;
  return [request.requestNumber, request.purpose, request.requesterName, request.venueName, request.notes]
    .concat(request.lines.map((line) => line.label))
    .some((field) => field?.toLowerCase().includes(needle));
}

/** "3 requests · 2 pending review · 1 approved", in status order. */
function summarize(rows: BorrowRequest[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const parts = [plural(rows.length, "request")];
  for (const status of Object.keys(STATUS_LABELS) as BorrowStatus[]) {
    const count = counts.get(status);
    if (count) parts.push(`${count} ${STATUS_LABELS[status].toLowerCase()}`);
  }
  return parts.join(" · ");
}

async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

/** Approve, reject and cancel, shared by the row menus and the side panel. Each resolves true on success. */
type RequestActions = {
  approve: (request: BorrowRequest, reviewNote?: string) => Promise<boolean>;
  reject: (request: BorrowRequest, reviewNote?: string) => Promise<boolean>;
  cancel: (request: BorrowRequest) => Promise<boolean>;
};

function useRequestActions(): RequestActions {
  const { confirm } = useAppDialog();
  const approveMutation = useMutation(api.equipmentBorrowRequests.approve);
  const rejectMutation = useMutation(api.equipmentBorrowRequests.reject);
  const cancelMutation = useMutation(api.equipmentBorrowRequests.cancel);

  return {
    approve: (request, reviewNote) =>
      attempt(
        () => approveMutation({ id: request._id, reviewNote: reviewNote?.trim() || undefined }),
        "Borrow request approved.",
      ),
    reject: async (request, reviewNote) => {
      const ok = await confirm({
        title: `Reject ${request.requesterName}'s request for ${request.purpose}?`,
        description: `${request.requestNumber} is marked Not approved and ${request.requesterName} gets an email${reviewNote?.trim() ? " with your note" : ""}. The request stays in the list.`,
        destructive: true,
        confirmLabel: "Reject request",
        cancelLabel: "Keep pending",
      });
      if (!ok) return false;
      return attempt(
        () => rejectMutation({ id: request._id, reviewNote: reviewNote?.trim() || undefined }),
        "Borrow request rejected.",
      );
    },
    cancel: async (request) => {
      const ok = await confirm({
        title: `Cancel your request for ${request.purpose}?`,
        description: `Staff won't review ${request.requestNumber} anymore. It stays in your list as Cancelled; send a new request if you still need the gear.`,
        destructive: true,
        confirmLabel: "Cancel request",
        cancelLabel: "Keep request",
      });
      if (!ok) return false;
      return attempt(() => cancelMutation({ id: request._id }), "Borrow request cancelled.");
    },
  };
}

export function EquipmentBorrowRequestsClient() {
  const shell = useSessionShell();
  const canReview = shell?.viewer?.isAdmin ?? false;
  const searchParams = useSearchParams();
  const tab = borrowRequestTabFromParam(searchParams.get("tab"), canReview);
  const [formOpen, setFormOpen] = useState(false);
  const [requestParam, setRequestParam] = useSheetParam("request");
  // The row that was clicked, shown while the panel's own query loads.
  const [clicked, setClicked] = useState<BorrowRequest | null>(null);
  const actions = useRequestActions();

  const pending = useQuery(api.equipmentBorrowRequests.list, canReview ? { status: "submitted" } : "skip");
  const pendingCount = pending?.length ?? 0;
  const detail = useQuery(api.equipmentBorrowRequests.get, requestParam ? { id: requestParam } : "skip");
  const panelRequest = detail?.request ?? (clicked && clicked._id === requestParam ? clicked : null);

  // A `?request=` link to a request that's gone or isn't the viewer's: say so and drop the param.
  useEffect(() => {
    if (!requestParam || detail !== null) return;
    notify.error("That borrow request doesn't exist, or it isn't yours to see.");
    setRequestParam(null);
  }, [detail, requestParam, setRequestParam]);

  function openRequest(request: BorrowRequest) {
    setClicked(request);
    setRequestParam(request._id);
  }

  function closeRequest() {
    setRequestParam(null);
  }

  function selectTab(next: BorrowRequestTabId) {
    // Next keeps `useSearchParams` in sync with history calls, so this switches tabs in place.
    window.history.pushState(null, "", borrowRequestTabHref(next));
  }

  const tabs = BORROW_REQUEST_TABS.filter((id) => id !== "review" || canReview);

  return (
    <div className="space-y-4 pb-24" data-testid="borrow-requests-page">
      <PageHeader
        title="Borrow requests"
        description={
          canReview
            ? "Gear people want to borrow for their own use, each with a signed loan agreement. Approving a request books it as a will-call dry rental with a pull list."
            : "Ask to borrow Arbor gear for your own use and follow each request here. Staff review every request, and an approved one is booked as a will-call pickup."
        }
        actions={
          <Button type="button" size="sm" onClick={() => setFormOpen(true)}>
            <PlusIcon />
            New borrow request
          </Button>
        }
      />

      {shell === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {tabs.length > 1 ? (
            <PageTabs
              label="Borrow request views"
              tabs={tabs.map((id) => ({
                href: borrowRequestTabHref(id),
                label: BORROW_REQUEST_TAB_LABELS[id],
                icon: BORROW_REQUEST_TAB_ICONS[id],
                active: id === tab,
                onSelect: () => selectTab(id),
                badge:
                  id === "review" && pendingCount > 0 ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-status-amber-700 dark:text-status-amber-200"
                      title={`${plural(pendingCount, "request")} waiting on review`}
                      data-testid="borrow-requests-pending-badge"
                    >
                      <WarningIcon className="size-3.5" weight="fill" aria-hidden />
                      <span className="text-xs tabular-nums">{pendingCount}</span>
                    </span>
                  ) : undefined,
              }))}
            />
          ) : null}

          {tab === "review" ? (
            <ReviewTab actions={actions} onOpen={openRequest} />
          ) : (
            <MineTab actions={actions} onOpen={openRequest} onNew={() => setFormOpen(true)} />
          )}
        </>
      )}

      <DetailSheet
        open={Boolean(requestParam && panelRequest)}
        onOpenChange={(open) => {
          if (!open) closeRequest();
        }}
        testId="borrow-request-sheet"
      >
        {panelRequest ? (
          // Keyed so the review note resets when another request opens.
          <RequestSheetBody
            key={panelRequest._id}
            request={panelRequest}
            canReview={canReview}
            isMine={detail?.isMine ?? false}
            actions={actions}
            onDone={closeRequest}
          />
        ) : null}
      </DetailSheet>

      <EquipmentBorrowRequestForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={() => {
          setFormOpen(false);
          // Show the new request where it lives.
          if (tab !== "mine") selectTab("mine");
        }}
      />
    </div>
  );
}

function ReviewTab({ actions, onOpen }: { actions: RequestActions; onOpen: (request: BorrowRequest) => void }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(REVIEW_DEFAULT_FILTERS);
  const [nowMs] = useState(() => Date.now());
  const applied = activeFilters(filters);
  // One `is` status reads through the status index; anything else loads the newest requests.
  const serverStatus =
    applied.status?.operator === "is" && applied.status.values.length === 1
      ? (applied.status.values[0] as BorrowStatus)
      : undefined;
  const requests = useQuery(api.equipmentBorrowRequests.list, { status: serverStatus });

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

  const rows = useMemo(() => {
    if (!requests) return undefined;
    const needle = search.trim().toLowerCase();
    return requests
      .filter(
        (request) =>
          matchesSearch(request, needle) &&
          matchesFilter(applied.status, request.status) &&
          matchesFilter(applied.requester, request.requesterUserId) &&
          matchesFilter(applied.when, whenBucket(request, nowMs)),
      )
      .sort((a, b) => a.startAt - b.startAt);
  }, [applied.requester, applied.status, applied.when, nowMs, requests, search]);

  const isDefaultQueue =
    !search.trim() &&
    Object.keys(applied).length === 1 &&
    applied.status?.operator === "is" &&
    applied.status.values.length === 1 &&
    applied.status.values[0] === "submitted";

  return (
    <div className="space-y-4" data-testid="borrow-requests-review">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search number, purpose, requester, gear…"
        searchLabel="Search borrow requests"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />
      <RequestList
        rows={rows}
        showRequester
        canReview
        actions={actions}
        onOpen={onOpen}
        summaryTestId="borrow-requests-review-summary"
        order="Soonest pickup first. Open a request to read the signed agreement, then approve or reject it."
        empty={
          isDefaultQueue ? (
            <EmptyState>No borrow requests waiting on review. New ones show up here and in the sidebar badge.</EmptyState>
          ) : (
            <EmptyState
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilters(REVIEW_DEFAULT_FILTERS);
                  }}
                >
                  Back to the review queue
                </Button>
              }
            >
              No borrow requests match this search and these filters.
            </EmptyState>
          )
        }
      />
    </div>
  );
}

function MineTab({
  actions,
  onOpen,
  onNew,
}: {
  actions: RequestActions;
  onOpen: (request: BorrowRequest) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [nowMs] = useState(() => Date.now());
  const applied = activeFilters(filters);
  const mine = useQuery(api.equipmentBorrowRequests.listMine);

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "status", label: "Status", options: STATUS_OPTIONS },
      { id: "when", label: "When", options: WHEN_OPTIONS },
    ],
    [],
  );

  // `listMine` is already newest first.
  const rows = useMemo(() => {
    if (!mine) return undefined;
    const needle = search.trim().toLowerCase();
    return mine.filter(
      (request) =>
        matchesSearch(request, needle) &&
        matchesFilter(applied.status, request.status) &&
        matchesFilter(applied.when, whenBucket(request, nowMs)),
    );
  }, [applied.status, applied.when, mine, nowMs, search]);

  const filtered = Boolean(search.trim()) || Object.keys(applied).length > 0;

  return (
    <div className="space-y-4" data-testid="borrow-requests-mine">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search number, purpose, gear…"
        searchLabel="Search your borrow requests"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      />
      <RequestList
        rows={rows}
        canReview={false}
        actions={actions}
        onOpen={onOpen}
        summaryTestId="borrow-requests-mine-summary"
        order="Newest request first. You can cancel a request until staff review it."
        empty={
          filtered ? (
            <EmptyState
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilters({});
                  }}
                >
                  Clear search and filters
                </Button>
              }
            >
              None of your borrow requests match this search and these filters.
            </EmptyState>
          ) : (
            <EmptyState
              action={
                <Button type="button" variant="outline" size="sm" onClick={onNew}>
                  <PlusIcon />
                  New borrow request
                </Button>
              }
            >
              You haven&apos;t asked to borrow any equipment yet. Pick the gear and your dates, then sign the loan
              agreement.
            </EmptyState>
          )
        }
      />
    </div>
  );
}

function RequestList({
  rows,
  showRequester = false,
  canReview,
  actions,
  onOpen,
  summaryTestId,
  order,
  empty,
}: {
  rows: BorrowRequest[] | undefined;
  showRequester?: boolean;
  /** Rows offer approve / reject; otherwise they offer cancel on the viewer's own pending requests. */
  canReview: boolean;
  actions: RequestActions;
  onOpen: (request: BorrowRequest) => void;
  summaryTestId: string;
  order: string;
  empty: React.ReactNode;
}) {
  if (rows === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <>
      <ListSummary testId={summaryTestId} order={order}>
        {summarize(rows)}
      </ListSummary>
      {rows.length === 0 ? (
        empty
      ) : (
        <div className="border" data-testid="borrow-requests-list">
          <div className="flex items-center gap-2 border-b bg-muted/20 py-2 pr-1 pl-3 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Request</span>
            <span className="hidden w-28 text-right md:block">Pickup</span>
            <span className="hidden w-28 text-right md:block">Return</span>
            <span className="hidden w-32 text-center sm:block">Status</span>
            <span className="w-8" />
          </div>
          <ul className="divide-y [&>li]:border-0">
            {rows.map((request) => {
              const pendingReview = request.status === "submitted";
              return (
                <ListRow
                  key={request._id}
                  data-testid={`borrow-request-row-${request._id}`}
                  onOpen={() => onOpen(request)}
                  actions={
                    <RowMenu label={`More for ${request.requestNumber}`}>
                      <DropdownMenuItem onSelect={() => onOpen(request)}>Open details</DropdownMenuItem>
                      {request.convertedEventId ? (
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/events/${request.convertedEventId}`}>View event</Link>
                        </DropdownMenuItem>
                      ) : null}
                      {canReview && pendingReview ? (
                        <>
                          <DropdownMenuItem onSelect={() => void actions.approve(request)}>Approve</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void actions.reject(request)}>
                            Reject
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {!canReview && pendingReview ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void actions.cancel(request)}>
                            Cancel request
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </RowMenu>
                  }
                >
                  <RowText
                    eyebrow={request.venueName ? `${request.requestNumber} · ${request.venueName}` : request.requestNumber}
                    title={request.purpose}
                    detail={
                      showRequester
                        ? `${request.requesterName} · ${equipmentSummary(request.lines)}`
                        : equipmentSummary(request.lines)
                    }
                  />
                  <RowCell className="w-28" hideBelow="md">
                    {formatDate(request.startAt)}
                  </RowCell>
                  <RowCell className="w-28" hideBelow="md">
                    {formatDate(request.endAt)}
                  </RowCell>
                  <StatusPill
                    tone={statusTone(request.status)}
                    className="hidden h-6 w-32 shrink-0 justify-center sm:inline-flex"
                  >
                    {statusLabel(request.status)}
                  </StatusPill>
                </ListRow>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function RequestSheetBody({
  request,
  canReview,
  isMine,
  actions,
  onDone,
}: {
  request: BorrowRequest;
  canReview: boolean;
  isMine: boolean;
  actions: RequestActions;
  /** Closes the panel; called only after an action succeeds. */
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "cancel" | null>(null);
  const pendingReview = request.status === "submitted";
  const reviewable = canReview && pendingReview;
  const cancellable = isMine && pendingReview;

  async function run(kind: "approve" | "reject" | "cancel", action: () => Promise<boolean>) {
    setBusy(kind);
    const ok = await action();
    setBusy(null);
    if (ok) onDone();
  }

  return (
    <div className="flex min-h-full flex-col">
      <DetailSheetHeader
        title={request.purpose}
        pill={
          <StatusPill tone={statusTone(request.status)} className="h-6">
            {statusLabel(request.status)}
          </StatusPill>
        }
        description={`${request.requestNumber} · requested by ${request.requesterName} on ${formatDate(request.createdAt)}`}
      />

      <SheetSection title="Loan">
        <SheetFields>
          <SheetField label="Pickup to return">{formatDateTimeRange(request.startAt, request.endAt)}</SheetField>
          {request.venueName ? <SheetField label="Venue">{request.venueName}</SheetField> : null}
          <SheetField label="Requester">{request.requesterName}</SheetField>
          {request.notes ? <SheetField label="Notes">{request.notes}</SheetField> : null}
        </SheetFields>
      </SheetSection>

      <SheetSection title="Equipment">
        {request.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No equipment on this request.</p>
        ) : (
          <ul className="divide-y border text-sm" data-testid="borrow-request-sheet-lines">
            {request.lines.map((line, index) => (
              <li key={`${line.label}-${index}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{line.quantity}×</span>
                <span className="min-w-0 flex-1 truncate">{line.label}</span>
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection title="Loan agreement">
        {request.agreement ? (
          <div className="space-y-2 text-sm" data-testid="borrow-request-sheet-agreement">
            <p>
              E-signed by <span className="font-medium">{request.agreement.signedName}</span> on{" "}
              {formatDateTime(request.agreement.signedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Signed as {request.agreement.signedEmail} · version {request.agreement.version}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {request.agreement.terms.map((term) => (
                <li key={term.key}>{term.text}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No loan agreement on file. This request predates them.</p>
        )}
      </SheetSection>

      {request.reviewedAt || request.reviewNote || request.convertedEventId ? (
        <SheetSection title="Review">
          <SheetFields>
            {request.reviewedByUserName ? (
              <SheetField label="Reviewed by">
                {request.reviewedByUserName}
                {request.reviewedAt ? ` on ${formatDate(request.reviewedAt)}` : ""}
              </SheetField>
            ) : null}
            {request.reviewNote ? <SheetField label="Note">{request.reviewNote}</SheetField> : null}
            {request.convertedEventId ? (
              <SheetField label="Booked as">
                <Link
                  href={`/dashboard/events/${request.convertedEventId}`}
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  Dry rental event
                  <ArrowSquareOutIcon className="size-3" aria-hidden />
                </Link>
              </SheetField>
            ) : null}
          </SheetFields>
        </SheetSection>
      ) : null}

      {reviewable ? (
        <SheetSection title="Decision">
          <div className="space-y-1.5">
            <Label htmlFor="borrow-review-note">Note for the requester (optional)</Label>
            <Textarea
              id="borrow-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Pickup instructions, or why it can't go ahead"
              rows={3}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Approving books a will-call dry rental with this gear on its pull list. Either way the requester gets an
            email.
          </p>
        </SheetSection>
      ) : null}

      {reviewable || cancellable ? (
        <DetailSheetFooter
          start={
            cancellable ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy !== null}
                onClick={() => void run("cancel", () => actions.cancel(request))}
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel request"}
              </Button>
            ) : undefined
          }
        >
          {reviewable ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void run("reject", () => actions.reject(request, note))}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </Button>
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("approve", () => actions.approve(request, note))}
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
            </>
          ) : null}
        </DetailSheetFooter>
      ) : null}
    </div>
  );
}
