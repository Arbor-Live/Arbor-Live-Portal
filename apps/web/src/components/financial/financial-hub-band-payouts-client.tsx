"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDate, formatDateTime, formatUsd } from "@/lib/format";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";

type BandPaymentQueue =
  | "all_pending"
  | "needs_payee"
  | "needs_email"
  | "awaiting_reply"
  | "ready_to_pay"
  | "paid";

const QUEUE_LABELS: Record<BandPaymentQueue, string> = {
  all_pending: "All pending",
  needs_payee: "Needs payee info",
  needs_email: "Needs signature request",
  awaiting_reply: "Awaiting signature",
  ready_to_pay: "Ready to pay",
  paid: "Paid",
};

export function FinancialHubBandPayoutsClient() {
  const [queue, setQueue] = useState<BandPaymentQueue>("all_pending");
  const rows = useQuery(api.bandPayments.listByQueue, { queue });
  const queueCounts = useQuery(api.bandPayments.getQueueCounts, {});
  const settings = useQuery(api.bandPayments.getSettings, {});
  const sendConfirmation = useMutation(api.bandPayments.sendConfirmationEmail);
  const sendPayeeRequired = useMutation(api.bandPayments.sendPayeeRequiredEmail);
  const syncStalePayeePayments = useMutation(api.bandPayments.syncStalePayeePayments);
  const markPaid = useMutation(api.bandPayments.markPaid);
  const cancelPayment = useMutation(api.bandPayments.cancelPayment);
  const updateSettings = useMutation(api.bandPayments.updateSettings);

  const [busyPaymentId, setBusyPaymentId] = useState<Id<"eventBandPayments"> | null>(null);
  const [servicePaymentNumber, setServicePaymentNumber] = useState("");
  const [payTarget, setPayTarget] = useState<Id<"eventBandPayments"> | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Id<"eventBandPayments"> | null>(null);
  const preview = useQuery(
    api.bandPayments.buildConfirmationPreview,
    previewTarget ? { paymentId: previewTarget } : "skip",
  );
  const [settingsDraft, setSettingsDraft] = useState<{ photoAlbumUrl: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const photoAlbumUrl = settingsDraft?.photoAlbumUrl ?? settings?.photoAlbumUrl ?? "";

  useEffect(() => {
    void syncStalePayeePayments({});
  }, [syncStalePayeePayments]);

  async function onSendConfirmation(paymentId: Id<"eventBandPayments">) {
    setBusyPaymentId(paymentId);
    setActionError(null);
    try {
      await sendConfirmation({ paymentId });
    } catch (error) {
      setActionError(getConvexErrorMessage(error));
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function onSendPayeeRequired(paymentId: Id<"eventBandPayments">) {
    setBusyPaymentId(paymentId);
    setActionError(null);
    try {
      await sendPayeeRequired({ paymentId });
    } catch (error) {
      setActionError(getConvexErrorMessage(error));
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function onMarkPaid() {
    if (!payTarget || !servicePaymentNumber.trim()) return;
    setBusyPaymentId(payTarget);
    setActionError(null);
    try {
      await markPaid({ paymentId: payTarget, servicePaymentNumber: servicePaymentNumber.trim() });
      setPayTarget(null);
      setServicePaymentNumber("");
    } catch (error) {
      setActionError(getConvexErrorMessage(error));
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function onSaveSettings() {
    try {
      await updateSettings({
        photoAlbumUrl,
      });
      setSettingsDraft(null);
      notify.success("Settings saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  function queueCountFor(key: BandPaymentQueue) {
    if (!queueCounts) return null;
    if (key === "all_pending") {
      return (
        queueCounts.needs_payee +
        queueCounts.needs_email +
        queueCounts.awaiting_reply +
        queueCounts.ready_to_pay
      );
    }
    return queueCounts[key];
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Band payment defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="space-y-1">
            <Label>Default photo album URL</Label>
            <Input
              value={photoAlbumUrl}
              onChange={(e) => setSettingsDraft({ photoAlbumUrl: e.target.value })}
              placeholder="https://photos.arbor.st/share/..."
            />
          </div>
          <div>
            <Button type="button" onClick={() => void onSaveSettings()}>
              Save defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {actionError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(QUEUE_LABELS) as BandPaymentQueue[]).map((key) => {
          const count = queueCountFor(key);
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={queue === key ? "default" : "outline"}
              onClick={() => setQueue(key)}
            >
              {QUEUE_LABELS[key]}
              {count !== null ? ` (${count})` : ""}
            </Button>
          );
        })}
      </div>

      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading band payouts…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">No band payments in this queue.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row._id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{row.bandName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Payee:</span>{" "}
                    {row.designatedPayeeName
                      ? `${row.designatedPayeeName} (${row.designatedPayeeEmail ?? "no email"})`
                      : "Not configured"}
                  </p>
                  <p className="whitespace-pre-wrap sm:col-span-2">
                    <span className="font-medium">Address:</span>{" "}
                    {row.designatedPayeeMailingAddress?.trim() || "—"}
                  </p>
                  <p>
                    <span className="font-medium">Total:</span> {formatUsd(row.totalUsd)}
                  </p>
                  <p>
                    <span className="font-medium">Event:</span> {formatDate(row.eventStartAt)} ·{" "}
                    {row.eventTitle}
                  </p>
                  <p>
                    <span className="font-medium">Payout method:</span>{" "}
                    {formatBandPayeePayoutMethod(row.designatedPayeePayoutMethod)}
                  </p>
                </div>

                <div className="grid gap-1 border-t border-border/60 pt-2 text-muted-foreground sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">Payment ID:</span>{" "}
                    {row.confirmationToken}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Status:</span> {row.statusLabel}
                  </p>
                  {row.confirmationEmailSentAt ? (
                    <p>
                      <span className="font-medium text-foreground">Signature request sent:</span>{" "}
                      {formatDateTime(row.confirmationEmailSentAt)}
                      {row.confirmationSentByName ? ` · ${row.confirmationSentByName}` : ""}
                    </p>
                  ) : null}
                  {row.confirmedAt ? (
                    <p>
                      <span className="font-medium text-foreground">Signed:</span>{" "}
                      {formatDateTime(row.confirmedAt)}
                      {row.signatureTypedName
                        ? ` · ${row.signatureTypedName}`
                        : row.confirmationReplyFrom
                          ? ` · ${row.confirmationReplyFrom}`
                          : ""}
                    </p>
                  ) : null}
                  {row.servicePaymentNumber ? (
                    <p>
                      <span className="font-medium text-foreground">Transfer / Service Payment #:</span>{" "}
                      {row.servicePaymentNumber}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/events/${row.eventId}`}>Open event</Link>
                  </Button>
                  {row.status === "pending_payee" ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyPaymentId === row._id}
                      onClick={() => void onSendPayeeRequired(row._id)}
                    >
                      Request payee info
                    </Button>
                  ) : null}
                  {row.status === "pending_email" || row.status === "awaiting_confirmation" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewTarget(row._id)}
                      >
                        Preview email
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyPaymentId === row._id || !row.payeeComplete}
                        onClick={() => void onSendConfirmation(row._id)}
                      >
                        {row.status === "awaiting_confirmation"
                          ? "Resend signature request"
                          : "Send signature request"}
                      </Button>
                    </>
                  ) : null}
                  {!row.payeeComplete && row.status !== "pending_payee" ? (
                    <p className="self-center text-xs text-muted-foreground">
                      Payee info incomplete — signature request blocked.
                    </p>
                  ) : null}
                  {row.status === "confirmed" ? (
                    <Button type="button" size="sm" onClick={() => setPayTarget(row._id)}>
                      Mark paid
                    </Button>
                  ) : null}
                  {row.canDownloadAgreementPdf ? (
                    <BandPaymentAgreementPdfButton paymentId={row._id} />
                  ) : null}
                  {row.status !== "paid" && row.status !== "cancelled" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyPaymentId === row._id}
                      onClick={() => void cancelPayment({ paymentId: row._id })}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {previewTarget && preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signature request email preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Subject</Label>
              <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{preview.subject}</p>
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-2 text-sm">
                {preview.body}
              </pre>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setPreviewTarget(null)}>
              Close preview
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {payTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mark-paid-title"
          onClick={() => {
            setPayTarget(null);
            setServicePaymentNumber("");
          }}
        >
          <div
            className="w-full max-w-md space-y-4 border border-border bg-background p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="mark-paid-title" className="text-base font-semibold">
              Mark band payment paid
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter the GrantEd transfer / Service Payment number after submitting evidence. Band
              members will be notified that Stanford is processing the payment.
            </p>
            <div className="space-y-1">
              <Label>Transfer / Service Payment number</Label>
              <Input
                value={servicePaymentNumber}
                onChange={(e) => setServicePaymentNumber(e.target.value)}
                placeholder="SP-2026-0042"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!servicePaymentNumber.trim() || busyPaymentId === payTarget}
                onClick={() => void onMarkPaid()}
              >
                Confirm paid
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setPayTarget(null);
                  setServicePaymentNumber("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
