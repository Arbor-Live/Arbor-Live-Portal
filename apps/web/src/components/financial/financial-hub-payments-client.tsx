"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PaymentQueue = "payment_pending" | "proof_no_receipt" | "payment_received" | "overdue";

const QUEUE_LABELS: Record<PaymentQueue, string> = {
  payment_pending: "Payment pending",
  proof_no_receipt: "Proof attached, no receipt",
  payment_received: "Payment received",
  overdue: "Overdue",
};

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function FinancialHubPaymentsClient() {
  const [queue, setQueue] = useState<PaymentQueue>("payment_pending");
  const rows = useQuery(api.paymentProof.listByQueue, { queue });
  const markReceived = useMutation(api.paymentProof.markPaymentReceived);
  const invalidateSubmission = useMutation(api.paymentProof.invalidateSubmission);
  const generateUploadUrl = useMutation(api.paymentProof.generateReceiptUploadUrl);
  const attachReceipt = useMutation(api.paymentProof.attachReceipt);

  const [invalidateTarget, setInvalidateTarget] = useState<Id<"eventPaymentProofSubmissions"> | null>(null);
  const [invalidateNote, setInvalidateNote] = useState("");
  const [busyInvoiceId, setBusyInvoiceId] = useState<Id<"invoices"> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadInvoiceId, setUploadInvoiceId] = useState<Id<"invoices"> | null>(null);

  async function onMarkReceived(invoiceId: Id<"invoices">) {
    setBusyInvoiceId(invoiceId);
    try {
      await markReceived({ invoiceId });
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function onInvalidate() {
    if (!invalidateTarget) return;
    setBusyInvoiceId(null);
    try {
      await invalidateSubmission({ submissionId: invalidateTarget, note: invalidateNote });
      setInvalidateTarget(null);
      setInvalidateNote("");
    } catch {
      // query refresh will show state
    }
  }

  async function onReceiptSelected(invoiceId: Id<"invoices">, file: File) {
    setBusyInvoiceId(invoiceId);
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
    } finally {
      setBusyInvoiceId(null);
      setUploadInvoiceId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(QUEUE_LABELS) as PaymentQueue[]).map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={queue === key ? "default" : "outline"}
            onClick={() => setQueue(key)}
          >
            {QUEUE_LABELS[key]}
          </Button>
        ))}
      </div>

      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading payments…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">No invoices in this queue.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={`${row.invoiceId}:${row.eventId}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {row.invoiceNumber} · {row.eventTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-1 sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Client:</span>{" "}
                    {row.clientContactName ?? row.clientEmail ?? "—"}
                  </p>
                  <p>
                    <span className="font-medium">Total:</span> {formatUsd(row.totalUsd)}
                  </p>
                  <p>
                    <span className="font-medium">Due:</span> {formatDate(row.dueAt)}
                  </p>
                  {row.isOverdue ? (
                    <p className="text-destructive">
                      <span className="font-medium">Late fees:</span> {formatUsd(row.lateFeeUsd)}
                    </p>
                  ) : row.weeksUntilLateFee > 0 ? (
                    <p className="text-muted-foreground">
                      Late fees begin in {row.weeksUntilLateFee}{" "}
                      {row.weeksUntilLateFee === 1 ? "week" : "weeks"}
                    </p>
                  ) : null}
                </div>

                {row.submission ? (
                  <div className="rounded-md border p-3">
                    <p>
                      <span className="font-medium">Proof:</span> {row.submission.paymentMethodLabel} ·{" "}
                      {row.submission.paymentReference}
                    </p>
                    <p className="text-muted-foreground">
                      Submitted {formatDate(row.submission.submittedAt)}
                      {row.submission.financeContactEmail
                        ? ` · Finance: ${row.submission.financeContactEmail}`
                        : ""}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/financial-hub/invoices/${row.invoiceId}`}>Open invoice</Link>
                  </Button>
                  {!row.paymentReceivedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyInvoiceId === row.invoiceId}
                      onClick={() => onMarkReceived(row.invoiceId)}
                    >
                      Mark payment received
                    </Button>
                  ) : null}
                  {row.submission && !row.paymentReceivedAt ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setInvalidateTarget(row.submission!.id);
                          setInvalidateNote("");
                        }}
                      >
                        Invalidate proof
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyInvoiceId === row.invoiceId}
                        onClick={() => {
                          setUploadInvoiceId(row.invoiceId);
                          fileInputRef.current?.click();
                        }}
                      >
                        {row.hasReceipt ? "Replace receipt" : "Attach receipt"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && uploadInvoiceId) void onReceiptSelected(uploadInvoiceId, file);
          event.target.value = "";
        }}
      />

      {invalidateTarget ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invalidate payment proof</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The client will be able to submit new payment proof from their portal.
            </p>
            <textarea
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              value={invalidateNote}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setInvalidateNote(event.target.value)
              }
              placeholder="Reason for invalidation (required)"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={onInvalidate}>
                Confirm invalidate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setInvalidateTarget(null);
                  setInvalidateNote("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
