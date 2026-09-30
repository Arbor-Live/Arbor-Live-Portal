"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { InvoiceDraft } from "./use-invoice-draft";

/**
 * An approved quote is an estimate until the event is over and hours are
 * final. Finalizing it makes it the final invoice and opens payment; staff can
 * open payment early for a deposit. Shown under the approval in the workflow strip.
 */
export function InvoiceBillingState({ draft }: { draft: InvoiceDraft }) {
  const { confirm } = useAppDialog();
  const finalizeBilling = useMutation(api.invoices.finalizeBilling);
  const reopenBilling = useMutation(api.invoices.reopenBilling);
  const setPaymentOpenedEarly = useMutation(api.invoices.setPaymentOpenedEarly);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const invoice = draft.invoice!;
  const invoiceId = draft.activeInvoiceId!;

  const days = draft.linkedDayEvents.length > 0 ? draft.linkedDayEvents : draft.linkedEvent ? [draft.linkedEvent] : [];
  const eventEndAt = days.length > 0 ? Math.max(...days.map((day) => day.endAt)) : null;
  const eventEnded = eventEndAt != null && eventEndAt < now;

  async function finalize() {
    if (draft.isDraftDirty) {
      notify.error("Save or discard your changes before finalizing.");
      return;
    }
    const confirmed = await confirm({
      title: `Finalize ${invoice.invoiceNumber} at ${formatUsd(invoice.totalUsd)}?`,
      description: eventEnded
        ? "It becomes the final invoice and payment opens for the client. Reopen it if something still needs changing."
        : "The event hasn't ended yet, so hours may still change. Finalizing opens payment for the client now.",
      confirmLabel: "Finalize invoice",
    });
    if (!confirmed) return;
    try {
      const result = await finalizeBilling({ id: invoiceId });
      notify.success(
        result.number ? `Finalized as version ${result.number}. Payment is open.` : "Already finalized.",
      );
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not finalize the invoice."));
    }
  }

  async function reopen() {
    const confirmed = await confirm({
      title: `Reopen ${invoice.invoiceNumber}?`,
      description:
        "It goes back to an approved estimate so you can change it, and payment closes unless it was opened early. Finalize it again when it's right.",
      confirmLabel: "Reopen invoice",
    });
    if (!confirmed) return;
    try {
      await reopenBilling({ id: invoiceId });
      notify.success("Invoice reopened.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not reopen the invoice."));
    }
  }

  async function closeEarlyPayment() {
    try {
      await setPaymentOpenedEarly({ id: invoiceId, open: false });
      notify.success("Payment closes until the final invoice.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not close payment."));
    }
  }

  if (invoice.billingFinalizedAt) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 border border-status-emerald-500/40 bg-status-emerald-500/10 px-2.5 py-1.5 text-status-emerald-700"
        data-testid="invoice-billing-state"
      >
        <span className="min-w-0 flex-1">
          Final invoice since {formatDate(invoice.billingFinalizedAt)}
          {invoice.billingFinalizedByName ? ` (${invoice.billingFinalizedByName})` : ""}. Payment is open.
        </span>
        {invoice.paymentReceivedAt ? null : (
          <Button type="button" variant="outline" size="sm" className="bg-background" onClick={() => void reopen()}>
            Reopen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 border border-status-blue-500/40 bg-status-blue-500/10 px-2.5 py-1.5 text-status-blue-700"
      data-testid="invoice-billing-state"
    >
      <span className="min-w-0 flex-1">
        {invoice.paymentOpenedEarlyAt ? (
          <>
            Approved estimate. Payment opened early on {formatDate(invoice.paymentOpenedEarlyAt)}
            {invoice.paymentOpenedEarlyNote ? `: “${invoice.paymentOpenedEarlyNote}”` : "."}
          </>
        ) : eventEnded ? (
          <>The event is over. Finalize the invoice once hours are final, and payment opens for the client.</>
        ) : (
          <>
            Approved estimate. Payment opens when you finalize the invoice after the event
            {eventEndAt != null ? ` (ends ${formatDate(eventEndAt)})` : ""}.
          </>
        )}
      </span>
      {invoice.paymentOpenedEarlyAt ? (
        invoice.paymentReceivedAt ? null : (
          <Button type="button" variant="outline" size="sm" className="bg-background" onClick={() => void closeEarlyPayment()}>
            Close early payment
          </Button>
        )
      ) : (
        <Button type="button" variant="outline" size="sm" className="bg-background" onClick={() => setEarlyOpen(true)}>
          Open payment early
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant={eventEnded ? "default" : "outline"}
        className={eventEnded ? undefined : "bg-background"}
        data-testid="invoice-finalize-billing"
        onClick={() => void finalize()}
      >
        Finalize invoice
      </Button>
      <OpenPaymentEarlyDialog
        open={earlyOpen}
        onOpenChange={setEarlyOpen}
        onConfirm={async (note) => {
          try {
            await setPaymentOpenedEarly({ id: invoiceId, open: true, note });
            notify.success("Payment is open before the final invoice.");
            return true;
          } catch (error) {
            notify.error(getConvexErrorMessage(error, "Could not open payment."));
            return false;
          }
        }}
      />
    </div>
  );
}

function OpenPaymentEarlyDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="open-payment-early-dialog">
        <DialogHeader>
          <DialogTitle>Open payment before the final invoice?</DialogTitle>
          <DialogDescription>
            The client can submit payment for the approved estimate now, for a deposit or a prepayment. The final
            invoice still comes after the event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="open-payment-early-note">Why</Label>
          <Textarea
            id="open-payment-early-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Grant funds expire at the end of the quarter."
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !note.trim()}
            onClick={async () => {
              setSaving(true);
              const ok = await onConfirm(note.trim());
              setSaving(false);
              if (ok) {
                setNote("");
                onOpenChange(false);
              }
            }}
          >
            Open payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
