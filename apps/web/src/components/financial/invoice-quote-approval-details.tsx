"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";

type InvoiceApprovalRecord = {
  clientApprovalStatus?: "pending" | "approved" | "changes_requested";
  approvedAt?: number;
  changesRequestedAt?: number;
  clientApprovalSignedName?: string;
  clientApprovalNote?: string;
  termsVersionAccepted?: string;
  termsAcceptedAt?: number;
  clientIsPaymentSubmitter?: boolean;
  paymentSubmitterName?: string;
  paymentSubmitterEmail?: string;
  payingPartyNotifiedEmail?: string;
  payingPartyNotifiedAt?: number;
  clientContactName?: string;
  clientEmail?: string;
};

function formatTimestamp(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: InvoiceApprovalRecord["clientApprovalStatus"]) {
  switch (status) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    default:
      return "Awaiting client approval";
  }
}

export function InvoiceQuoteApprovalDetails({
  invoiceId,
  invoice,
}: {
  invoiceId: Id<"invoices">;
  invoice: InvoiceApprovalRecord;
}) {
  const updatePaymentSubmitter = useMutation(api.invoices.updatePaymentSubmitter);
  const resendPayingPartyNotification = useMutation(api.invoices.resendPayingPartyNotification);

  const [clientIsPaymentSubmitter, setClientIsPaymentSubmitter] = useState(
    invoice.clientIsPaymentSubmitter ?? false,
  );
  const [paymentSubmitterName, setPaymentSubmitterName] = useState(invoice.paymentSubmitterName ?? "");
  const [paymentSubmitterEmail, setPaymentSubmitterEmail] = useState(invoice.paymentSubmitterEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approved = (invoice.clientApprovalStatus ?? "pending") === "approved";

  async function handleSaveSubmitter() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updatePaymentSubmitter({
        id: invoiceId,
        clientIsPaymentSubmitter,
        paymentSubmitterName: clientIsPaymentSubmitter ? undefined : paymentSubmitterName.trim(),
        paymentSubmitterEmail: clientIsPaymentSubmitter ? undefined : paymentSubmitterEmail.trim(),
      });
      setMessage("Payment submitter updated.");
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Unable to update payment submitter."));
    } finally {
      setSaving(false);
    }
  }

  async function handleResendNotification() {
    setResending(true);
    setError(null);
    setMessage(null);
    try {
      await resendPayingPartyNotification({ id: invoiceId });
      setMessage("Paying party notification sent.");
    } catch (resendError) {
      setError(getConvexErrorMessage(resendError, "Unable to send paying party notification."));
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client approval & payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <p>
            <span className="font-medium">Status:</span> {statusLabel(invoice.clientApprovalStatus)}
          </p>
          {invoice.clientApprovalSignedName ? (
            <p>
              <span className="font-medium">Signed by:</span> {invoice.clientApprovalSignedName}
            </p>
          ) : null}
          {invoice.approvedAt ? (
            <p>
              <span className="font-medium">Approved:</span> {formatTimestamp(invoice.approvedAt)} Pacific
            </p>
          ) : null}
          {invoice.changesRequestedAt ? (
            <p>
              <span className="font-medium">Changes requested:</span>{" "}
              {formatTimestamp(invoice.changesRequestedAt)} Pacific
            </p>
          ) : null}
          {invoice.termsVersionAccepted ? (
            <p>
              <span className="font-medium">Terms accepted:</span> {invoice.termsVersionAccepted}
              {invoice.termsAcceptedAt
                ? ` · ${formatTimestamp(invoice.termsAcceptedAt)} Pacific`
                : ""}
            </p>
          ) : null}
          {invoice.clientApprovalNote ? (
            <p>
              <span className="font-medium">Client change request:</span> {invoice.clientApprovalNote}
            </p>
          ) : null}
        </div>

        {approved ? (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="font-medium">Payment submitter</p>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={clientIsPaymentSubmitter}
                onChange={(e) => {
                  setClientIsPaymentSubmitter(e.target.checked);
                  if (e.target.checked) {
                    setPaymentSubmitterName("");
                    setPaymentSubmitterEmail("");
                  }
                }}
                className="mt-1"
              />
              <span>Client will submit payment ({invoice.clientContactName ?? invoice.clientEmail ?? "contact on file"})</span>
            </label>

            {!clientIsPaymentSubmitter ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment-submitter-name">Financial Officer or Paying party name</Label>
                  <Input
                    id="payment-submitter-name"
                    value={paymentSubmitterName}
                    onChange={(e) => setPaymentSubmitterName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-submitter-email">Financial Officer or Paying party email</Label>
                  <Input
                    id="payment-submitter-email"
                    type="email"
                    value={paymentSubmitterEmail}
                    onChange={(e) => setPaymentSubmitterEmail(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {invoice.payingPartyNotifiedAt && invoice.payingPartyNotifiedEmail ? (
              <p className="text-muted-foreground">
                Paying party notified {formatTimestamp(invoice.payingPartyNotifiedAt)} Pacific at{" "}
                {invoice.payingPartyNotifiedEmail}
              </p>
            ) : !clientIsPaymentSubmitter && paymentSubmitterEmail ? (
              <p className="text-muted-foreground">Paying party has not been notified yet.</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void handleSaveSubmitter()}>
                {saving ? "Saving..." : "Save payment submitter"}
              </Button>
              {!clientIsPaymentSubmitter && paymentSubmitterEmail ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={resending}
                  onClick={() => void handleResendNotification()}
                >
                  {resending ? "Sending..." : "Resend paying party email"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Payment submitter details appear here after the client approves the quote.
          </p>
        )}

        {message ? <p className="text-primary">{message}</p> : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
