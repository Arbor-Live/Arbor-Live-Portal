"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { LinkSimpleIcon } from "@phosphor-icons/react";
import { InvoicePdfDownloadButton } from "@/components/financial/invoice-pdf-download-button";
import type { PaymentActions } from "@/components/financial/payment-actions";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill, type Tone } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatUsd } from "@/lib/format";
import { invoiceLifecycle, lifecycleLabel, lifecycleTone, type InvoiceLifecycle } from "@/lib/invoice-lifecycle";
import { notify } from "@/lib/notify";

const PAYMENT_STATUS: Record<string, { label: string; tone: Tone; lifecycle: InvoiceLifecycle | null }> = {
  not_applicable: { label: "Not approved yet", tone: "neutral", lifecycle: null },
  payment_pending: { label: "Waiting on payment", tone: "blue", lifecycle: "payment_pending" },
  proof_submitted: { label: "Proof to verify", tone: "amber", lifecycle: "proof_received" },
  overdue: { label: "Overdue", tone: "rose", lifecycle: "overdue" },
  payment_received: { label: "Paid", tone: "emerald", lifecycle: "paid" },
};

/**
 * A `?invoice=` param as an id, or null. `invoices.get` validates its id and
 * throws on anything else, so a mangled link would otherwise break the page.
 */
export function invoiceIdParam(value: string | null): Id<"invoices"> | null {
  return value && /^[0-9a-z]{20,40}$/.test(value) ? (value as Id<"invoices">) : null;
}

export async function copyQuoteLink(token: string) {
  const url = `${window.location.origin}/event/${token}`;
  try {
    await navigator.clipboard.writeText(url);
    notify.success("Quote link copied.");
  } catch {
    notify.error("Could not copy the link.");
  }
}

/**
 * One invoice at a glance: who it's for, what it's worth, where it is, and its
 * payment, with the payment actions inline. The full editor stays on the
 * invoice page ("Open invoice"). Shared by the All invoices and Payments tabs.
 */
export function InvoiceSheet({
  invoiceId,
  onOpenChange,
  payments,
}: {
  invoiceId: Id<"invoices"> | null;
  onOpenChange: (open: boolean) => void;
  payments: PaymentActions;
}) {
  return (
    <DetailSheet open={invoiceId !== null} onOpenChange={onOpenChange} testId="invoice-sheet">
      {invoiceId ? (
        // Keyed so local state resets when another invoice opens.
        <InvoiceSheetBody key={invoiceId} invoiceId={invoiceId} payments={payments} onClose={() => onOpenChange(false)} />
      ) : null}
    </DetailSheet>
  );
}

function InvoiceSheetBody({
  invoiceId,
  payments,
  onClose,
}: {
  invoiceId: Id<"invoices">;
  payments: PaymentActions;
  onClose: () => void;
}) {
  const { confirm } = useAppDialog();
  const data = useQuery(api.invoices.get, { id: invoiceId });
  const payment = useQuery(api.paymentProof.getByInvoiceId, { invoiceId });
  const voidInvoice = useMutation(api.invoices.voidInvoice);
  const unvoidInvoice = useMutation(api.invoices.unvoidInvoice);

  if (data === undefined) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (data === null) {
    return <p className="p-4 text-sm text-muted-foreground">This invoice no longer exists.</p>;
  }

  const { invoice, series, additionallyLinkedEvents } = data;
  const paymentStatus = payment ? PAYMENT_STATUS[payment.status] : undefined;
  const lifecycle = invoiceLifecycle({
    status: invoice.status,
    clientApprovalStatus: invoice.clientApprovalStatus,
    paymentStatus: paymentStatus?.lifecycle ?? null,
  });
  const client = invoice.clientGroupName?.trim() || invoice.clientContactName?.trim() || "No client yet";
  const received = Boolean(payment?.paymentReceivedAt);
  const busy = payments.busyInvoiceId === invoiceId;

  async function toggleVoid() {
    if (invoice.status === "void") {
      try {
        await unvoidInvoice({ id: invoiceId });
        notify.success(`Restored ${invoice.invoiceNumber}.`);
      } catch (error) {
        notify.error(getConvexErrorMessage(error, "Could not restore the invoice."));
      }
      return;
    }
    const ok = await confirm({
      title: `Void ${invoice.invoiceNumber}?`,
      description: "It leaves the active list and the client's link stops working. You can restore it later.",
      destructive: true,
      confirmLabel: "Void invoice",
    });
    if (!ok) return;
    try {
      await voidInvoice({ id: invoiceId });
      notify.success(`Voided ${invoice.invoiceNumber}.`);
      onClose();
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not void the invoice."));
    }
  }

  const amounts: Array<[string, number | undefined]> = [
    ["Equipment", invoice.equipmentSubtotalUsd],
    ["Crew", invoice.crewSubtotalUsd],
    ["Artists", invoice.artistsSubtotalUsd],
    ["External rentals", invoice.externalRentalsSubtotalUsd],
    ["Fees", invoice.feesSubtotalUsd],
  ];

  return (
    <>
      <DetailSheetHeader
        title={invoice.invoiceNumber}
        pill={
          <StatusPill tone={lifecycleTone(lifecycle)} className="h-6">
            {lifecycleLabel(lifecycle)}
          </StatusPill>
        }
        description={`${client} · ${formatUsd(invoice.totalUsd)} · managed by ${invoice.managerName}`}
      />

      <SheetSection title="Client">
        <SheetFields>
          <SheetField label="Organization">{invoice.clientGroupName || "—"}</SheetField>
          <SheetField label="Contact">{invoice.clientContactName || "—"}</SheetField>
          <SheetField label="Email">{invoice.clientEmail || "—"}</SheetField>
          {invoice.clientPhone ? <SheetField label="Phone">{invoice.clientPhone}</SheetField> : null}
        </SheetFields>
      </SheetSection>

      <SheetSection title="Amounts">
        <SheetFields>
          {amounts
            .filter(([, value]) => (value ?? 0) > 0)
            .map(([label, value]) => (
              <SheetField key={label} label={label}>
                <span className="tabular-nums">{formatUsd(value ?? 0)}</span>
              </SheetField>
            ))}
          {(invoice.discountAmountUsd ?? 0) > 0 ? (
            <SheetField label="Discount">
              <span className="tabular-nums">−{formatUsd(invoice.discountAmountUsd ?? 0)}</span>
            </SheetField>
          ) : null}
          <SheetField label="Total">
            <span className="font-medium tabular-nums">{formatUsd(invoice.totalUsd)}</span>
          </SheetField>
        </SheetFields>
      </SheetSection>

      <SheetSection title="Where it stands">
        <SheetFields>
          <SheetField label="Issued">{invoice.issueDate}</SheetField>
          {invoice.dueDate ? <SheetField label="Due">{invoice.dueDate}</SheetField> : null}
          {invoice.approvedAt ? <SheetField label="Approved">{formatDate(invoice.approvedAt)}</SheetField> : null}
          {invoice.changesRequestedAt ? (
            <SheetField label="Changes asked">{formatDate(invoice.changesRequestedAt)}</SheetField>
          ) : null}
          {invoice.publicQuoteOpenCount ? (
            <SheetField label="Quote opened">
              {invoice.publicQuoteOpenCount} time{invoice.publicQuoteOpenCount === 1 ? "" : "s"}
              {invoice.publicQuoteLastOpenedAt ? `, last ${formatDate(invoice.publicQuoteLastOpenedAt)}` : ""}
            </SheetField>
          ) : null}
          <SheetField label="For">
            {series
              ? `${series.title} (series, ${series.activeOccurrenceCount} shows)`
              : payment?.eventTitle
                ? payment.eventTitle
                : additionallyLinkedEvents.length
                  ? additionallyLinkedEvents.map((event) => event.title).join(", ")
                  : "No event linked"}
          </SheetField>
        </SheetFields>
      </SheetSection>

      {payment && payment.status !== "not_applicable" ? (
        <SheetSection title="Payment">
          <div className="flex flex-wrap items-center gap-2" data-testid="invoice-sheet-payment">
            {paymentStatus ? (
              <StatusPill tone={paymentStatus.tone} className="h-6">
                {paymentStatus.label}
              </StatusPill>
            ) : null}
            {payment.dueAt ? (
              <span className="text-sm text-muted-foreground">Due {formatDate(payment.dueAt)}</span>
            ) : null}
            {payment.isOverdue && payment.lateFeeUsd > 0 ? (
              <span className="text-sm text-destructive">Late fees {formatUsd(payment.lateFeeUsd)}</span>
            ) : null}
          </div>
          {payment.submission ? (
            <div className="space-y-0.5 border px-3 py-2 text-sm">
              <p>
                <span className="font-medium">{payment.submission.paymentMethodLabel}</span> ·{" "}
                {payment.submission.paymentReference}
              </p>
              <p className="text-xs text-muted-foreground">
                Submitted {formatDate(payment.submission.submittedAt)}
                {payment.submission.financeContactEmail ? ` by ${payment.submission.financeContactEmail}` : ""}
              </p>
            </div>
          ) : !received ? (
            <p className="text-sm text-muted-foreground">No payment proof submitted yet.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {payment.hasReceipt ? "Receipt attached." : "No receipt attached."}
            {payment.invalidatedSubmissions.length
              ? ` ${payment.invalidatedSubmissions.length} earlier proof${payment.invalidatedSubmissions.length === 1 ? " was" : "s were"} invalidated.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {!received ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void payments.markReceived(invoiceId, invoice.invoiceNumber)}
              >
                Mark payment received
              </Button>
            ) : null}
            {payment.submission && !received ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  payments.requestInvalidate({
                    submissionId: payment.submission!.id,
                    invoiceNumber: invoice.invoiceNumber,
                  })
                }
              >
                Invalidate proof
              </Button>
            ) : null}
            {payment.submission || received ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => payments.pickReceipt(invoiceId)}>
                {payment.hasReceipt ? "Replace receipt" : "Attach receipt"}
              </Button>
            ) : null}
          </div>
        </SheetSection>
      ) : null}

      <DetailSheetFooter
        start={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={invoice.status === "void" ? undefined : "text-destructive"}
            onClick={() => void toggleVoid()}
          >
            {invoice.status === "void" ? "Restore invoice" : "Void invoice"}
          </Button>
        }
      >
        <InvoicePdfDownloadButton invoiceId={invoiceId} invoiceNumber={invoice.invoiceNumber} size="sm" label="PDF" />
        {invoice.publicApprovalToken ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void copyQuoteLink(invoice.publicApprovalToken!)}>
            <LinkSimpleIcon />
            Copy quote link
          </Button>
        ) : null}
        <Button asChild size="sm">
          <Link href={`/dashboard/ops-center/invoices/${invoiceId}`}>
            Open invoice
          </Link>
        </Button>
      </DetailSheetFooter>
    </>
  );
}
