"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type StatusFilter = "all" | "action_needed" | "awaiting_confirmation" | "confirmed" | "paid";

function statusBadgeClass(status: string) {
  switch (status) {
    case "awaiting_confirmation":
      return "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
    case "confirmed":
      return "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-200";
    case "paid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "pending_payee":
    case "pending_email":
      return "bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function BandPaymentHistorySection() {
  const payments = useQuery(api.bandPayments.listForActiveBand, {});
  const signPayment = useMutation(api.bandPayments.signPayment);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [signingId, setSigningId] = useState<Id<"eventBandPayments"> | null>(null);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (payments ?? []).filter((payment) => {
      if (statusFilter === "action_needed" && !payment.canSign) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "action_needed" &&
        payment.status !== statusFilter
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        payment.eventTitle,
        payment.venueName,
        payment.confirmationToken,
        payment.statusLabel,
        payment.designatedPayeeName,
        payment.servicePaymentNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [payments, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const signingPayment = payments?.find((payment) => payment._id === signingId) ?? null;
  const actionNeededCount = (payments ?? []).filter((payment) => payment.canSign).length;

  async function onSign() {
    if (!signingId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await signPayment({ paymentId: signingId, typedName, agreed });
      setSuccess("Payment signed. Arbor Live will process payout next.");
      setSigningId(null);
      setTypedName("");
      setAgreed(false);
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Payment history</CardTitle>
          <CardDescription>
            Track payout status for your performances. Only the designated payee can e-sign pending
            amounts.
          </CardDescription>
        </div>
        {actionNeededCount > 0 ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
            {actionNeededCount} need{actionNeededCount === 1 ? "s" : ""} your signature
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not sign</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {success ? (
          <Alert>
            <AlertTitle>Signed</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search</label>
            <Input
              className="w-56"
              placeholder="Event, payment ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(0);
              }}
            >
              <option value="all">All</option>
              <option value="action_needed">Needs my signature</option>
              <option value="awaiting_confirmation">Awaiting signature</option>
              <option value="confirmed">Ready to pay</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        {payments === undefined ? (
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Payment ID</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((payment) => (
                    <tr key={payment._id} className="border-b last:border-b-0">
                      <td className="px-3 py-3 align-top">
                        <div className="space-y-0.5">
                          <p className="font-medium">{payment.eventTitle}</p>
                          {payment.venueName ? (
                            <p className="text-xs text-muted-foreground">{payment.venueName}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-muted-foreground">
                        {formatDate(payment.eventStartAt)}
                      </td>
                      <td className="px-3 py-3 align-top font-mono text-xs">
                        {payment.confirmationToken}
                      </td>
                      <td className="px-3 py-3 align-top">{formatUsd(payment.totalUsd)}</td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            statusBadgeClass(payment.status),
                          )}
                        >
                          {payment.statusLabel}
                        </span>
                        {payment.status === "awaiting_confirmation" && !payment.canSign ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Waiting on
                            {payment.designatedPayeeName
                              ? ` ${payment.designatedPayeeName}`
                              : " designated payee"}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          {payment.canSign ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                setSigningId(payment._id);
                                setTypedName("");
                                setAgreed(false);
                                setError(null);
                              }}
                            >
                              E-sign
                            </Button>
                          ) : null}
                          {payment.canDownloadAgreementPdf ? (
                            <BandPaymentAgreementPdfButton
                              paymentId={payment._id}
                              label="PDF"
                              size="sm"
                            />
                          ) : null}
                          {!payment.canSign && !payment.canDownloadAgreementPdf ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pageRows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {payments.length === 0
                    ? "No payments yet."
                    : "No payments match your filters."}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">
                {filtered.length === 0
                  ? "0 payments"
                  : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min(
                      (safePage + 1) * PAGE_SIZE,
                      filtered.length,
                    )} of ${filtered.length}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {safePage + 1} of {pageCount}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Sheet
        open={signingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSigningId(null);
            setTypedName("");
            setAgreed(false);
          }
        }}
      >
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>E-sign payment</SheetTitle>
            <SheetDescription>
              Confirm the payout amount for {signingPayment?.eventTitle ?? "this performance"}.
            </SheetDescription>
          </SheetHeader>
          {signingPayment ? (
            <div className="space-y-4 px-4">
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <p>
                  <span className="font-medium">Amount:</span>{" "}
                  {formatUsd(signingPayment.totalUsd)}
                </p>
                <p>
                  <span className="font-medium">Payment ID:</span>{" "}
                  <span className="font-mono text-xs">{signingPayment.confirmationToken}</span>
                </p>
              </div>
              <p className="text-sm">
                I agree that the payment amount of{" "}
                <span className="font-medium">{formatUsd(signingPayment.totalUsd)}</span> for{" "}
                {signingPayment.eventTitle} is accurate and authorize Arbor Live to proceed with
                payout.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to the payment amount of {formatUsd(signingPayment.totalUsd)}.
                </span>
              </label>
              <div className="space-y-1">
                <Label htmlFor="band-payment-sign-name">Full legal name</Label>
                <Input
                  id="band-payment-sign-name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type your full legal name"
                />
              </div>
            </div>
          ) : null}
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSigningId(null);
                setTypedName("");
                setAgreed(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !agreed || typedName.trim().length < 2}
              onClick={() => void onSign()}
            >
              {busy ? "Signing…" : "Submit signature"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
