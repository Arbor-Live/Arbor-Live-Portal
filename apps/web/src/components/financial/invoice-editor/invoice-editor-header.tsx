"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CopyIcon,
  EnvelopeSimpleIcon,
  FilePdfIcon,
  ProhibitIcon,
  RepeatIcon,
  TrashIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { AdminCascadeDeleteDialog } from "@/components/admin/admin-cascade-delete-dialog";
import { useInvoicePdfDownload } from "@/components/financial/invoice-pdf-download-button";
import { SendQuoteToClientSheet } from "@/components/financial/send-quote-to-client-sheet";
import { MetaItem, PageHeader, StatusPill, StatusPillSelect } from "@/components/page-header";
import { useSessionViewer } from "@/components/session-shell-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatContactFullName } from "@/lib/contact-name";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatDateTime, pacificDateAndTimeToMs } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  CLIENT_APPROVAL_LABELS,
  INVOICE_STATUS_LABELS,
  clientApprovalTone,
  invoiceStatusTone,
  type InvoiceStatus,
} from "./invoice-status";
import { InvoiceBillingState } from "./invoice-billing-state";
import type { InvoiceDraft } from "./use-invoice-draft";

type SourceRequest = {
  _id: Id<"eventRequests">;
  requestNumber: string;
  email: string;
  eventName?: string;
  publicToken?: string;
} | null | undefined;

const LINK_PILL =
  "inline-flex min-h-7 items-center gap-1.5 border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground";

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(message);
  } catch {
    notify.error("Could not copy link.");
  }
}

function useOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * The quote's header: invoice number, status, who it's for and when it's due,
 * the one next step (send to the client, or copy the quote link), and the
 * secondary actions in `⋯`. The workflow strip under it holds the client link
 * and the approval state.
 */
export function InvoiceEditorHeader({
  draft,
  sourceRequest,
}: {
  draft: InvoiceDraft;
  sourceRequest: SourceRequest;
}) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const isAdmin = useSessionViewer()?.isAdmin ?? false;
  const origin = useOrigin();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendSheet, setSendSheet] = useState({ open: false, key: 0 });
  const [sendingQuote, setSendingQuote] = useState(false);

  const { invoice, activeInvoiceId, fields } = draft;
  const pdf = useInvoicePdfDownload(activeInvoiceId, invoice?.invoiceNumber);
  const duplicateInvoice = useMutation(api.invoices.duplicate);
  const voidInvoice = useMutation(api.invoices.voidInvoice);
  const unvoidInvoice = useMutation(api.invoices.unvoidInvoice);
  const finalizeInvoice = useMutation(api.invoices.finalize);
  const withdrawFromClientReview = useMutation(api.invoices.withdrawFromClientReview);
  const recalculateSeriesEquipmentLines = useMutation(api.invoices.recalculateSeriesEquipmentLines);
  const markReadyForClientReview = useMutation(api.invoices.markReadyForClientReview);
  const deleteInvoiceAdmin = useMutation(api.adminDeletes.deleteInvoiceAdmin);
  const deletePreview = useQuery(
    api.adminDeletes.previewInvoiceDeletion,
    deleteOpen && activeInvoiceId ? { id: activeInvoiceId } : "skip",
  );

  const status: InvoiceStatus = invoice?.status ?? "draft";
  const approval = invoice?.clientApprovalStatus ?? "pending";
  const isRequestLinked = Boolean(invoice?.sourceEventRequestId);
  const onRequestPortal = Boolean(invoice?.clientReviewReadyAt);
  const quoteUrl = draft.approvalToken && origin ? `${origin}/event/${draft.approvalToken}` : "";

  async function run(action: () => Promise<unknown>, success: string, failure: string) {
    try {
      await action();
      notify.success(success);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error, failure));
      return false;
    }
  }

  async function handleVoid() {
    if (!activeInvoiceId) return;
    const confirmed = await confirm({
      title: `Void ${invoice?.invoiceNumber ?? "this invoice"}?`,
      description: "It will hide from the active list. You can unvoid it later.",
      confirmLabel: "Void",
      destructive: true,
    });
    if (!confirmed) return;
    await run(() => voidInvoice({ id: activeInvoiceId }), "Invoice voided.", "Could not void the invoice.");
  }

  async function handleUnvoid() {
    if (!activeInvoiceId) return;
    await run(() => unvoidInvoice({ id: activeInvoiceId }), "Invoice restored.", "Could not unvoid the invoice.");
  }

  async function handleWithdraw() {
    if (!activeInvoiceId) return;
    await run(
      () => withdrawFromClientReview({ id: activeInvoiceId }),
      "Quote withdrawn from the request portal for editing.",
      "Could not withdraw the quote.",
    );
  }

  async function changeStatus(next: InvoiceStatus) {
    if (!activeInvoiceId || next === status) return;
    if (next === "void") return handleVoid();
    if (status === "void") return handleUnvoid();
    if (next === "finalized") {
      // A standalone quote can't go back to draft from here, so ask first.
      const confirmed = await confirm({
        title: `Finalize ${invoice?.invoiceNumber ?? "this invoice"}?`,
        description: "It moves out of draft. Only voiding moves it again.",
        confirmLabel: "Finalize",
      });
      if (!confirmed) return;
      await run(() => finalizeInvoice({ id: activeInvoiceId }), "Invoice finalized.", "Could not finalize the invoice.");
      return;
    }
    if (next === "draft" && onRequestPortal) return handleWithdraw();
  }

  // Only offer moves the backend supports. Unvoid restores to finalized when
  // the quote was already out or approved, otherwise to draft.
  const restoredStatus: InvoiceStatus =
    invoice?.clientReviewReadyAt || invoice?.approvedAt || invoice?.paymentReceivedAt || approval === "approved"
      ? "finalized"
      : "draft";
  const reachable: InvoiceStatus[] =
    status === "void"
      ? ["void", restoredStatus]
      : status === "finalized"
        ? [...(onRequestPortal ? (["draft"] as const) : []), "finalized", "void"]
        : [
            "draft",
            // Booking-request quotes are finalized by sending them to the client.
            ...(isRequestLinked ? [] : (["finalized"] as const)),
            "void",
          ];
  const statusOptions = reachable.map((value) => ({
    value,
    label: INVOICE_STATUS_LABELS[value],
    tone: invoiceStatusTone(value),
  }));

  async function sendQuoteToClient(clientMessage: string) {
    if (!activeInvoiceId) return;
    if (fields.termsIds.length === 0) {
      throw new Error("Select at least one terms template before sending.");
    }
    setSendingQuote(true);
    try {
      if (draft.isDraftDirty) {
        const saved = await draft.persistDraft();
        if (!saved) throw new Error("Save the quote before sending.");
      }
      await markReadyForClientReview({ id: activeInvoiceId, clientMessage });
      notify.success("Quote emailed to the client and marked ready on the request portal.");
    } catch (error) {
      throw new Error(getConvexErrorMessage(error, "Failed to send quote email."));
    } finally {
      setSendingQuote(false);
    }
  }

  function openSendSheet() {
    if (fields.termsIds.length === 0) {
      notify.error("Select at least one terms template before sending.");
      return;
    }
    setSendSheet((current) => ({ open: true, key: current.key + 1 }));
  }

  const hostName =
    (draft.groups ?? []).find((group) => group._id === fields.groupId)?.name ?? invoice?.clientGroupName;
  const contact = (draft.contacts ?? []).find((row) => row._id === fields.contactId);
  const contactName = contact ? formatContactFullName(contact.firstName, contact.lastName) : invoice?.clientContactName;
  const firstEventAt = draft.linkedDayEvents[0]?.startAt ?? draft.linkedEvent?.startAt;
  const dueAt = fields.dueDate ? pacificDateAndTimeToMs(fields.dueDate, "12:00") : null;
  const series = draft.linkedSeries;
  const linkedDays = series ? [] : draft.linkedDayEvents;

  const title = activeInvoiceId ? (invoice?.invoiceNumber ?? "Invoice") : "Create invoice";
  const description =
    status === "void"
      ? "This invoice is void and hidden from the active list."
      : !activeInvoiceId
        ? "Add line items and pick the client. Saving gives the quote its number and a client link."
        : undefined;

  const primaryAction = !activeInvoiceId ? null : isRequestLinked ? (
    onRequestPortal ? null : (
      <Button
        data-testid="invoice-send-quote-to-client"
        type="button"
        size="sm"
        disabled={!sourceRequest?.email || status === "void"}
        title={fields.termsIds.length === 0 ? "Select at least one terms template first" : undefined}
        onClick={openSendSheet}
      >
        <EnvelopeSimpleIcon />
        Send quote to client
      </Button>
    )
  ) : (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!quoteUrl}
      onClick={() => void copyToClipboard(quoteUrl, "Quote link copied to clipboard.")}
    >
      <CopyIcon />
      Copy quote link
    </Button>
  );

  const menu = activeInvoiceId ? (
    <>
      <DropdownMenuItem
        disabled={pdf.status === "loading"}
        onSelect={() => {
          void pdf.download().then((ok) => {
            if (!ok) notify.error("Unable to download PDF. Please try again.");
          });
        }}
      >
        <FilePdfIcon />
        {pdf.status === "loading" ? "Preparing PDF…" : "Download PDF"}
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="invoice-duplicate"
        onSelect={() => {
          void (async () => {
            try {
              const result = await duplicateInvoice({ id: activeInvoiceId });
              router.push(`/dashboard/financial-hub/invoices/${result.id}`);
            } catch (error) {
              notify.error(getConvexErrorMessage(error, "Could not duplicate the invoice."));
            }
          })();
        }}
      >
        <CopyIcon />
        Duplicate
      </DropdownMenuItem>
      {series ? (
        <>
          <DropdownMenuItem
            onSelect={() =>
              void run(
                () => recalculateSeriesEquipmentLines({ id: activeInvoiceId }),
                "Recalculated billed equipment totals.",
                "Could not recalculate equipment totals.",
              )
            }
          >
            <ArrowClockwiseIcon />
            Recalculate equipment totals
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/events/series/${series.seriesId}`}>
              <RepeatIcon />
              Open series
            </Link>
          </DropdownMenuItem>
        </>
      ) : null}
      <DropdownMenuSeparator />
      {status === "void" ? (
        <DropdownMenuItem onSelect={() => void handleUnvoid()}>
          <ArrowCounterClockwiseIcon />
          Unvoid
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem variant="destructive" onSelect={() => void handleVoid()}>
          <ProhibitIcon />
          Void
        </DropdownMenuItem>
      )}
      {isAdmin ? (
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
          <TrashIcon />
          Delete quote
        </DropdownMenuItem>
      ) : null}
    </>
  ) : null;

  return (
    <>
      <PageHeader
        back={{
          href: "/dashboard/financial-hub/invoices",
          label: "Invoices",
          onClick: (event) => {
            if (!draft.isDraftDirty) return;
            event.preventDefault();
            void (async () => {
              const ok = await confirm({
                title: "Discard unsaved changes to this quote?",
                description: "What you've typed that hasn't been saved will be lost.",
                confirmLabel: "Discard changes",
                destructive: true,
              });
              if (ok) router.push("/dashboard/financial-hub/invoices");
            })();
          },
        }}
        actions={primaryAction}
        menu={menu}
        menuLabel="More invoice actions"
        pills={
          invoice ? (
            <>
              <StatusPillSelect
                value={status}
                options={statusOptions}
                onChange={(next) => void changeStatus(next)}
                label="Invoice status"
              />
              {status !== "void" ? (
                <StatusPill tone={clientApprovalTone(approval)}>
                  <span data-testid="invoice-approval-status">{CLIENT_APPROVAL_LABELS[approval]}</span>
                </StatusPill>
              ) : null}
              {sourceRequest ? (
                <Link href={`/dashboard/financial-hub/requests/${sourceRequest._id}`} className={LINK_PILL}>
                  <EnvelopeSimpleIcon className="size-3.5" aria-hidden />
                  Request {sourceRequest.requestNumber}
                </Link>
              ) : null}
              {series ? (
                <Link href={`/dashboard/events/series/${series.seriesId}`} className={LINK_PILL}>
                  <RepeatIcon className="size-3.5" aria-hidden />
                  {series.title} · {series.activeOccurrenceCount} billable occurrence
                  {series.activeOccurrenceCount === 1 ? "" : "s"}
                </Link>
              ) : null}
              {linkedDays.map((day, index) => (
                <Link key={day._id} href={`/dashboard/events/${day._id}`} className={LINK_PILL}>
                  <CalendarDotsIcon className="size-3.5" aria-hidden />
                  {linkedDays.length > 1 ? `Day ${index + 1} · ` : "Event · "}
                  {formatDate(day.startAt)}
                </Link>
              ))}
              {draft.otherLinkedEvents.map((event) => (
                <Link
                  key={event._id}
                  href={`/dashboard/events/${event._id}`}
                  className={LINK_PILL}
                  data-testid="invoice-additional-event-link"
                  title={event.title}
                >
                  <CalendarDotsIcon className="size-3.5" aria-hidden />
                  {linkedDays.length === 0 && !draft.linkedEvent ? "Event" : "Also linked"} ·{" "}
                  {formatDate(event.startAt)}
                </Link>
              ))}
            </>
          ) : null
        }
        title={title}
        description={description}
        meta={
          <>
            <MetaItem icon={BuildingsIcon}>
              {hostName ?? <span className="text-muted-foreground">No host yet</span>}
            </MetaItem>
            {contactName ? <MetaItem icon={UserCircleIcon}>{contactName}</MetaItem> : null}
            {firstEventAt != null ? <MetaItem icon={CalendarBlankIcon}>{formatDate(firstEventAt)}</MetaItem> : null}
            {dueAt != null ? <MetaItem icon={CalendarCheckIcon}>Due {formatDate(dueAt)}</MetaItem> : null}
          </>
        }
      >
        {activeInvoiceId && invoice ? (
          <InvoiceWorkflowStrip
            draft={draft}
            isRequestLinked={isRequestLinked}
            onRequestPortal={onRequestPortal}
            requestPortalUrl={
              sourceRequest?.publicToken ? `${origin}/request/track/${sourceRequest.publicToken}` : ""
            }
            quoteUrl={quoteUrl}
            onWithdraw={() => void handleWithdraw()}
          />
        ) : null}
      </PageHeader>

      <SendQuoteToClientSheet
        key={sendSheet.key}
        open={sendSheet.open}
        onOpenChange={(open) => setSendSheet((current) => ({ ...current, open }))}
        toEmail={sourceRequest?.email ?? ""}
        managerEmail={fields.managerEmail || undefined}
        subjectPreview={`Your quote is ready: ${
          sourceRequest?.eventName?.trim() || sourceRequest?.requestNumber?.trim() || "your event"
        }`}
        sending={sendingQuote}
        onSend={sendQuoteToClient}
      />

      <AdminCascadeDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        entityName="quote"
        preview={deletePreview ?? null}
        onConfirm={async (cascade) => {
          if (!activeInvoiceId) return;
          await deleteInvoiceAdmin({ id: activeInvoiceId, cascade });
          router.push("/dashboard/financial-hub/invoices");
        }}
      />
    </>
  );
}

/**
 * Where the quote is with the client: the link they use, whether it's out for
 * review, and what they said. Replaces the old Request portal / Quote approval
 * sidebar cards.
 */
function InvoiceWorkflowStrip({
  draft,
  isRequestLinked,
  onRequestPortal,
  requestPortalUrl,
  quoteUrl,
  onWithdraw,
}: {
  draft: InvoiceDraft;
  isRequestLinked: boolean;
  onRequestPortal: boolean;
  requestPortalUrl: string;
  quoteUrl: string;
  onWithdraw: () => void;
}) {
  const { confirm } = useAppDialog();
  const regeneratePublicApprovalToken = useMutation(api.invoices.regeneratePublicApprovalToken);
  const resetApprovalToPending = useMutation(api.invoices.resetApprovalToPending);
  const invoice = draft.invoice!;
  const invoiceId = draft.activeInvoiceId!;
  const approval = invoice.clientApprovalStatus ?? "pending";

  async function regenerateToken() {
    const confirmed = await confirm({
      title: "Regenerate the public quote link?",
      description: "The current link stops working for anyone who has it.",
      confirmLabel: "Regenerate link",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const result = await regeneratePublicApprovalToken({ id: invoiceId });
      draft.setApprovalToken(result.token);
      notify.success("Public quote link regenerated.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not regenerate the quote link."));
    }
  }

  async function resetApproval() {
    const confirmed = await confirm({
      title: `Reset ${invoice.invoiceNumber} to pending approval?`,
      description:
        "Clears the client's signature, change request and payment submitter. The client will need to approve the quote again.",
      confirmLabel: "Reset approval",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await resetApprovalToPending({ id: invoiceId });
      notify.success("Quote reset to pending approval.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not reset the approval."));
    }
  }

  const linkLabel = isRequestLinked ? "Request portal" : "Quote link";
  const linkUrl = isRequestLinked ? requestPortalUrl : quoteUrl;

  return (
    <div className="space-y-2 border bg-muted/20 px-3 py-2.5 text-sm" data-testid="invoice-workflow">
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid={isRequestLinked ? "invoice-request-portal" : "invoice-quote-approval"}
      >
        <span className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{linkLabel}</span>
        <Input
          readOnly
          aria-label={linkLabel}
          data-testid={isRequestLinked ? "invoice-request-portal-link" : "invoice-approval-link"}
          className="h-8 min-w-0 flex-1 basis-64 bg-background font-mono text-xs"
          value={linkUrl || (isRequestLinked ? "Save to load portal link." : "Save draft to generate link.")}
        />
        {isRequestLinked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!linkUrl}
            onClick={() => void copyToClipboard(linkUrl, "Portal link copied to clipboard.")}
          >
            <CopyIcon />
            Copy
          </Button>
        ) : (
          <Button
            data-testid="invoice-regenerate-token"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void regenerateToken()}
          >
            <ArrowClockwiseIcon />
            Regenerate
          </Button>
        )}
      </div>

      {isRequestLinked ? (
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {onRequestPortal && invoice.clientReviewReadyAt ? (
            <>
              <span>
                On the request portal since{" "}
                <span className="text-foreground">{formatDateTime(invoice.clientReviewReadyAt)}</span>.
              </span>
              <Button data-testid="invoice-withdraw-review" type="button" variant="outline" size="sm" onClick={onWithdraw}>
                Withdraw
              </Button>
            </>
          ) : (
            <span>Not sent to the client yet. Send it from the header when the quote is ready.</span>
          )}
        </div>
      ) : null}

      {approval !== "pending" ? (
        <div
          className={
            approval === "approved"
              ? "flex flex-wrap items-center gap-2 border border-status-emerald-500/40 bg-status-emerald-500/10 px-2.5 py-1.5 text-status-emerald-700"
              : "flex flex-wrap items-center gap-2 border border-status-amber-500/40 bg-status-amber-500/10 px-2.5 py-1.5 text-status-amber-700"
          }
          data-testid="invoice-approval-state"
        >
          <span className="min-w-0 flex-1">
            {approval === "approved" ? (
              <>
                Approved
                {invoice.clientApprovalSignedName ? ` by ${invoice.clientApprovalSignedName}` : ""}
                {invoice.approvedAt ? ` on ${formatDateTime(invoice.approvedAt)}` : ""}.
              </>
            ) : (
              <>
                Changes requested
                {invoice.changesRequestedAt ? ` on ${formatDateTime(invoice.changesRequestedAt)}` : ""}
                {invoice.clientApprovalNote ? `: “${invoice.clientApprovalNote}”` : "."}
              </>
            )}
          </span>
          <Button type="button" variant="outline" size="sm" className="bg-background" onClick={() => void resetApproval()}>
            Reset to pending
          </Button>
        </div>
      ) : null}
      {approval === "approved" && invoice.status !== "void" ? <InvoiceBillingState draft={draft} /> : null}
    </div>
  );
}
