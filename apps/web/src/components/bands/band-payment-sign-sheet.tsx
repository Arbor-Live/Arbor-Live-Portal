"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
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
import { formatUsd } from "@/lib/format";

type SignablePayment = {
  _id: Id<"eventBandPayments">;
  eventTitle: string;
  totalUsd: number;
  confirmationToken?: string;
};

export function BandPaymentSignSheet({
  payment,
  open,
  onOpenChange,
  onSigned,
}: {
  payment: SignablePayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSigned?: () => void;
}) {
  const signPayment = useMutation(api.bandPayments.signPayment);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTypedName("");
    setAgreed(false);
    setError(null);
  }

  async function onSign() {
    if (!payment) return;
    setBusy(true);
    setError(null);
    try {
      await signPayment({ paymentId: payment._id, typedName, agreed });
      reset();
      onOpenChange(false);
      onSigned?.();
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>E-sign payment</SheetTitle>
          <SheetDescription>
            Confirm the payout amount for {payment?.eventTitle ?? "this performance"}.
          </SheetDescription>
        </SheetHeader>
        {payment ? (
          <div className="space-y-4 px-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p>
                <span className="font-medium">Amount:</span> {formatUsd(payment.totalUsd)}
              </p>
              {payment.confirmationToken ? (
                <p>
                  <span className="font-medium">Payment ID:</span>{" "}
                  <span className="font-mono text-xs">{payment.confirmationToken}</span>
                </p>
              ) : null}
            </div>
            <p className="text-sm">
              I agree that the payment amount of{" "}
              <span className="font-medium">{formatUsd(payment.totalUsd)}</span> for{" "}
              {payment.eventTitle} is accurate and authorize Arbor Live to proceed with payout.
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
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !agreed || typedName.trim().length < 2 || !payment}
            onClick={() => void onSign()}
          >
            {busy ? "Signing…" : "Submit signature"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
