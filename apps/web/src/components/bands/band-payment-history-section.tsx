"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate, formatUsd } from "@/lib/format";

export function BandPaymentHistorySection() {
  const payments = useQuery(api.bandPayments.listForActiveBand, {});
  const signPayment = useMutation(api.bandPayments.signPayment);
  const [signingId, setSigningId] = useState<Id<"eventBandPayments"> | null>(null);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busyId, setBusyId] = useState<Id<"eventBandPayments"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSign(paymentId: Id<"eventBandPayments">) {
    setBusyId(paymentId);
    setError(null);
    setSuccess(null);
    try {
      await signPayment({ paymentId, typedName, agreed });
      setSuccess("Payment signed. Arbor Live will process payout next.");
      setSigningId(null);
      setTypedName("");
      setAgreed(false);
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card id="payment-history">
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
        <CardDescription>
          Track payout status for your performances. Only the designated payee can e-sign pending
          amounts.
        </CardDescription>
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
        {payments === undefined ? (
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment._id} className="space-y-3 border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{payment.eventTitle}</p>
                    <p className="text-muted-foreground">
                      {formatDate(payment.eventStartAt)}
                      {payment.venueName ? ` · ${payment.venueName}` : ""}
                    </p>
                    <p>
                      <span className="font-medium">Amount:</span> {formatUsd(payment.totalUsd)}
                    </p>
                    <p>
                      <span className="font-medium">Payment ID:</span> {payment.confirmationToken}
                    </p>
                    <p>
                      <span className="font-medium">Status:</span> {payment.statusLabel}
                    </p>
                    {payment.signatureTypedName ? (
                      <p className="text-muted-foreground">Signed as {payment.signatureTypedName}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {payment.canSign ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSigningId(payment._id);
                          setError(null);
                          setSuccess(null);
                        }}
                      >
                        E-sign payment
                      </Button>
                    ) : null}
                    {payment.canDownloadAgreementPdf ? (
                      <BandPaymentAgreementPdfButton paymentId={payment._id} />
                    ) : null}
                  </div>
                </div>

                {signingId === payment._id ? (
                  <div className="space-y-3 border bg-muted/20 p-3">
                    <p className="text-sm">
                      I agree that the payment amount of{" "}
                      <span className="font-medium">{formatUsd(payment.totalUsd)}</span> for{" "}
                      {payment.eventTitle} is accurate and authorize Arbor Live to proceed with
                      payout.
                    </p>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                      />
                      <span>I agree to the payment amount of {formatUsd(payment.totalUsd)}.</span>
                    </label>
                    <div className="space-y-1">
                      <Label htmlFor={`sign-name-${payment._id}`}>Full legal name</Label>
                      <Input
                        id={`sign-name-${payment._id}`}
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="Type your full legal name"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === payment._id || !agreed || typedName.trim().length < 2}
                        onClick={() => void onSign(payment._id)}
                      >
                        {busyId === payment._id ? "Signing…" : "Submit signature"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSigningId(null);
                          setTypedName("");
                          setAgreed(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {payment.status === "awaiting_confirmation" && !payment.canSign ? (
                  <p className="text-xs text-muted-foreground">
                    Waiting for the designated payee
                    {payment.designatedPayeeName ? ` (${payment.designatedPayeeName})` : ""} to
                    e-sign.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
