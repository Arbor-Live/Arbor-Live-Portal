"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  PAYMENT_PROOF_METHOD_OPTIONS,
  paymentProofReferenceLabel,
  type PaymentProofSubmissionFormValues,
} from "@/lib/validations/payment-proof";
import { formatDate, formatDateTime, formatUsd } from "@/lib/format";
import { optimisticMarkPaymentReceived } from "@/lib/payment-proof-optimistic";

type PaymentStatus = "not_applicable" | "payment_received" | "proof_submitted" | "payment_pending" | "overdue";

const STATUS_LABELS: Record<Exclude<PaymentStatus, "not_applicable">, string> = {
  payment_received: "Payment received",
  proof_submitted: "Proof submitted",
  payment_pending: "Payment pending",
  overdue: "Overdue",
};

export function InvoicePaymentStatusSection({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const details = useQuery(api.paymentProof.getByInvoiceId, { invoiceId });
  const markReceived = useMutation(
    api.paymentProof.markPaymentReceived,
  ).withOptimisticUpdate(optimisticMarkPaymentReceived);
  const invalidateSubmission = useMutation(api.paymentProof.invalidateSubmission);
  const generateUploadUrl = useMutation(api.paymentProof.generateReceiptUploadUrl);
  const attachReceipt = useMutation(api.paymentProof.attachReceipt);
  const submitByInvoiceId = useMutation(api.paymentProof.submitByInvoiceId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvalidate, setShowInvalidate] = useState(false);
  const [invalidateNote, setInvalidateNote] = useState("");
  const [showManualProof, setShowManualProof] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentProofSubmissionFormValues["paymentMethod"]>("assu_epay");
  const [paymentReference, setPaymentReference] = useState("");
  const [sendNotificationEmails, setSendNotificationEmails] = useState(false);

  if (details === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading payment status…</p>
        </CardContent>
      </Card>
    );
  }

  if (!details || !details.eligible) {
    return null;
  }

  const selectedMethodOption =
    PAYMENT_PROOF_METHOD_OPTIONS.find((option) => option.value === paymentMethod) ??
    PAYMENT_PROOF_METHOD_OPTIONS[0];

  async function onMarkReceived() {
    setBusy(true);
    setError(null);
    try {
      await markReceived({ invoiceId });
      notify.success("Payment marked as received.");
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onInvalidate() {
    if (!details?.submission) return;
    setBusy(true);
    setError(null);
    try {
      await invalidateSubmission({
        submissionId: details.submission.id,
        note: invalidateNote,
      });
      setShowInvalidate(false);
      setInvalidateNote("");
      notify.success("Payment proof invalidated. The client can submit again from their portal.");
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReceiptSelected(file: File) {
    setBusy(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await attachReceipt({ invoiceId, storageFileId: storageId });
      notify.success("Receipt attached.");
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitManualProof() {
    setBusy(true);
    setError(null);
    try {
      await submitByInvoiceId({
        invoiceId,
        paymentMethod,
        paymentReference,
        sendNotificationEmails,
      });
      setShowManualProof(false);
      setPaymentReference("");
      setSendNotificationEmails(false);
      notify.success("Payment proof recorded.");
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    details.status === "not_applicable"
      ? null
      : STATUS_LABELS[details.status as Exclude<PaymentStatus, "not_applicable">];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}


        <div className="flex flex-wrap items-center gap-2">
          {statusLabel ? (
            <span
              className={
                details.status === "overdue"
                  ? "rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
                  : details.status === "payment_received"
                    ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    : "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
              }
            >
              {statusLabel}
            </span>
          ) : null}
          {details.hasReceipt ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">Receipt attached</span>
          ) : null}
        </div>

        {!details.eventLinked ? (
          <Alert>
            <AlertDescription>
              Link an event to this invoice before recording or managing payment proof.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <p>
            <span className="font-medium">Total:</span> {formatUsd(details.totalUsd)}
          </p>
          {details.eventTitle ? (
            <p>
              <span className="font-medium">Event:</span> {details.eventTitle}
            </p>
          ) : null}
          {details.dueAt ? (
            <p>
              <span className="font-medium">Due:</span> {formatDate(details.dueAt)}
            </p>
          ) : null}
          {details.paymentReceivedAt ? (
            <p>
              <span className="font-medium">Received:</span> {formatDateTime(details.paymentReceivedAt)}
            </p>
          ) : null}
          {details.isOverdue ? (
            <p className="text-destructive sm:col-span-2">
              <span className="font-medium">Late fees:</span> {formatUsd(details.lateFeeUsd)}
            </p>
          ) : null}
        </div>

        {details.submission ? (
          <div className="rounded-md border p-3 space-y-1">
            <p>
              <span className="font-medium">Submitted proof:</span> {details.submission.paymentMethodLabel} ·{" "}
              {details.submission.paymentReference}
            </p>
            <p className="text-muted-foreground">
              Submitted {formatDateTime(details.submission.submittedAt)}
              {details.submission.financeContactEmail
                ? ` · Submitter: ${details.submission.financeContactEmail}`
                : ""}
            </p>
          </div>
        ) : !details.paymentReceivedAt ? (
          <p className="text-muted-foreground">No payment proof submitted yet.</p>
        ) : null}

        {details.invalidatedSubmissions.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium">Invalidated proof</p>
            <ul className="space-y-2 text-muted-foreground">
              {details.invalidatedSubmissions.map((row) => (
                <li key={row.id} className="rounded-md border border-dashed p-2">
                  {row.paymentMethodLabel} · {row.paymentReference}
                  {row.invalidatedAt ? ` · Invalidated ${formatDateTime(row.invalidatedAt)}` : ""}
                  {row.invalidationNote ? (
                    <p className="mt-1 text-foreground">{row.invalidationNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!details.paymentReceivedAt ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void onMarkReceived()}>
              Mark payment received
            </Button>
          ) : null}
          {details.submission && !details.paymentReceivedAt ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setShowInvalidate(true);
                  setInvalidateNote("");
                }}
              >
                Invalidate proof
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {details.hasReceipt ? "Replace receipt" : "Attach receipt"}
              </Button>
            </>
          ) : null}
          {details.canRecordProof ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setShowManualProof((current) => !current);
                setShowInvalidate(false);
              }}
            >
              {showManualProof ? "Cancel manual entry" : "Record proof manually"}
            </Button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onReceiptSelected(file);
            event.target.value = "";
          }}
        />

        {showInvalidate && details.submission ? (
          <div className="space-y-3 rounded-md border p-3">
            <p className="font-medium">Invalidate payment proof</p>
            <p className="text-muted-foreground">
              The client will be able to submit new payment proof from their portal.
            </p>
            <textarea
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              value={invalidateNote}
              onChange={(event) => setInvalidateNote(event.target.value)}
              placeholder="Reason for invalidation (required)"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => void onInvalidate()}>
                Confirm invalidate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setShowInvalidate(false);
                  setInvalidateNote("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {showManualProof && details.canRecordProof ? (
          <div className="space-y-3 rounded-md border p-3">
            <p className="font-medium">Record payment proof manually</p>
            <p className="text-muted-foreground">
              Use this when payment details were received outside the public portal.
            </p>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="space-y-2">
                {PAYMENT_PROOF_METHOD_OPTIONS.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="manual-payment-method"
                      checked={paymentMethod === option.value}
                      onChange={() => {
                        setPaymentMethod(option.value);
                        setPaymentReference("");
                      }}
                    />
                    <span>
                      <span className="font-medium">{option.label}</span>
                      <span className="block text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-payment-reference">{paymentProofReferenceLabel(paymentMethod)}</Label>
              <Input
                id="manual-payment-reference"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder={selectedMethodOption.placeholder}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendNotificationEmails}
                onChange={(event) => setSendNotificationEmails(event.target.checked)}
              />
              <span>Send payment proof notification emails</span>
            </label>
            <Button
              type="button"
              size="sm"
              disabled={busy || !paymentReference.trim()}
              onClick={() => void onSubmitManualProof()}
            >
              Save payment proof
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
