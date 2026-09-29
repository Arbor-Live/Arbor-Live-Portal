"use client";

import { useMutation, useQuery } from "convex/react";
import { WarningIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { InvoicePaymentStatusSection } from "@/components/financial/invoice-payment-status-section";
import { InvoiceQuoteApprovalDetails } from "@/components/financial/invoice-quote-approval-details";
import { FormSaveBar } from "@/components/forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { InvoiceEditorHeader } from "./invoice-editor-header";
import { InvoiceLineItems } from "./invoice-line-items";
import { InvoiceRequestSummary } from "./invoice-request-summary";
import { InvoiceSummaryRail } from "./invoice-summary-rail";
import { InvoiceTermsCard } from "./invoice-terms-card";
import { useInvoiceDraft, type InvoiceDraft } from "./use-invoice-draft";

/**
 * The quote / invoice editor (`/dashboard/financial-hub/invoices/[id]` and
 * `/new`). Reads like the document it produces: header and client workflow on
 * top, one line-items table, and a summary rail with the total. State lives in
 * `useInvoiceDraft`; each section edits its own rows.
 */
export function InvoiceEditor({
  invoiceId,
  initialIssueDate,
}: {
  invoiceId?: Id<"invoices">;
  initialIssueDate?: string;
}) {
  const draft = useInvoiceDraft({ invoiceId, initialIssueDate });
  const lookupId = draft.activeInvoiceId ?? invoiceId;
  const sourceRequest = useQuery(
    api.eventRequests.getByLinkedInvoiceId,
    lookupId ? { invoiceId: lookupId } : "skip",
  );
  const { activeInvoiceId, invoice } = draft;

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-24" data-testid="invoice-editor">
      <InvoiceEditorHeader draft={draft} sourceRequest={sourceRequest} />

      <InvoiceEditorAlerts draft={draft} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          {sourceRequest ? <InvoiceRequestSummary request={sourceRequest} /> : null}
          <InvoiceLineItems draft={draft} />
          <InvoiceTermsCard draft={draft} />
          {activeInvoiceId && invoice ? (
            <InvoiceQuoteApprovalDetails
              key={[
                invoice.clientIsPaymentSubmitter,
                invoice.paymentSubmitterEmail,
                invoice.paymentSubmitterName,
                invoice.payingPartyNotifiedAt,
                invoice.clientApprovalStatus,
                invoice.clientApprovalSignedName,
              ].join(":")}
              invoiceId={activeInvoiceId}
              invoice={invoice}
            />
          ) : null}
          {activeInvoiceId && invoice && (invoice.clientApprovalStatus ?? "pending") === "approved" ? (
            <InvoicePaymentStatusSection invoiceId={activeInvoiceId} />
          ) : null}
        </div>
        <InvoiceSummaryRail draft={draft} />
      </div>

      <FormSaveBar
        tier="C"
        saveStatus={draft.saveStatus}
        saveError={draft.saveError}
        isDirty={draft.isDraftDirty}
        isSubmitting={draft.saving || draft.saveStatus === "saving"}
        saveLabel="Save"
        onSave={() => void draft.persistDraft(true)}
        onRetry={() => void draft.persistDraft(true)}
        summary={
          <div>
            <p className="text-xs text-muted-foreground">{draft.isDraftDirty ? "Draft total" : "Total"}</p>
            <p className="font-semibold tabular-nums">{formatUsd(draft.draftTotals.totalUsd)}</p>
          </div>
        }
      />
    </div>
  );
}

/** Things to deal with before sending: an approved quote being edited, stale series counts, uneven splits. */
function InvoiceEditorAlerts({ draft }: { draft: InvoiceDraft }) {
  const recalculateSeriesEquipmentLines = useMutation(api.invoices.recalculateSeriesEquipmentLines);
  const { invoice, isDraftDirty, activeInvoiceId } = draft;

  async function recalculate() {
    if (!activeInvoiceId) return;
    try {
      await recalculateSeriesEquipmentLines({ id: activeInvoiceId });
      notify.success("Recalculated billed equipment totals.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not recalculate equipment totals."));
    }
  }

  const warnings: React.ReactNode[] = [];
  if (invoice?.clientApprovalStatus === "approved" && isDraftDirty) {
    warnings.push(<span key="approved">This quote is approved. Saving changes may require client re-approval.</span>);
  }
  if (draft.seriesOccurrenceStale) {
    warnings.push(
      <span key="series" className="flex flex-wrap items-center gap-2">
        Billable occurrence count changed ({invoice?.billableOccurrenceCountAtSave} → {draft.billableOccurrenceCount}).
        Recalculate equipment totals to refresh billed amounts.
        {activeInvoiceId ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void recalculate()}>
            Recalculate now
          </Button>
        ) : null}
      </span>,
    );
  }
  if (isDraftDirty) {
    for (const warning of draft.divisionWarnings) warnings.push(<span key={warning}>{warning}</span>);
  }
  if (warnings.length === 0) return null;

  return (
    <Alert className="border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700">
      <WarningIcon aria-hidden />
      <AlertDescription className="space-y-1 text-status-amber-700">
        {warnings.map((warning, index) => (
          <div key={index}>{warning}</div>
        ))}
      </AlertDescription>
    </Alert>
  );
}
