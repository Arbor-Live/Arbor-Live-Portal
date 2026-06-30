"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TextFormField } from "@/components/forms/text-form-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  PAYMENT_PROOF_METHOD_OPTIONS,
  paymentProofReferenceLabel,
  paymentProofSubmissionSchema,
  type PaymentProofSubmissionFormValues,
} from "@/lib/validations/payment-proof";

type PaymentProofState = {
  eligible: boolean;
  canSubmit: boolean;
  opensAt: number | null;
  paymentReceived: boolean;
  lateFee: {
    dueAt: number;
    lateFeeUsd: number;
    isOverdue: boolean;
    weeksUntilLateFee: number;
  } | null;
  submission: {
    paymentMethod: "assu_epay" | "ijournal" | "granted_transfer";
    paymentReference: string;
    financeContactEmail?: string;
    submittedAt: number;
  } | null;
};

type SubmitArgs = {
  token: string;
  paymentMethod: PaymentProofSubmissionFormValues["paymentMethod"];
  paymentReference: string;
  financeContactEmail?: string;
};

function formatOpensAt(opensAt: number) {
  return new Date(opensAt).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function paymentMethodDisplay(method: PaymentProofSubmissionFormValues["paymentMethod"]) {
  return PAYMENT_PROOF_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function PublicPaymentProofSection({
  token,
  paymentProof,
  submitMutation,
}: {
  token: string;
  paymentProof: PaymentProofState;
  submitMutation: (args: SubmitArgs) => Promise<{ ok: true }>;
}) {
  const form = useConvexForm<PaymentProofSubmissionFormValues>({
    schema: paymentProofSubmissionSchema,
    defaultValues: {
      paymentMethod: "assu_epay",
      paymentReference: "",
      financeContactEmail: "",
    },
    mode: "onTouched",
  });

  const selectedMethod = form.watch("paymentMethod");
  const selectedOption =
    PAYMENT_PROOF_METHOD_OPTIONS.find((option) => option.value === selectedMethod) ??
    PAYMENT_PROOF_METHOD_OPTIONS[0];

  const onSubmit = form.submitMutation(async (values) => {
    await submitMutation({
      token,
      paymentMethod: values.paymentMethod,
      paymentReference: values.paymentReference.trim(),
      financeContactEmail: values.financeContactEmail?.trim() || undefined,
    });
    form.reset({
      paymentMethod: values.paymentMethod,
      paymentReference: "",
      financeContactEmail: values.financeContactEmail ?? "",
    });
  });

  if (!paymentProof.eligible) {
    return null;
  }

  if (paymentProof.paymentReceived) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Received</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Arbor Live has marked your payment as received. Thank you!
        </CardContent>
      </Card>
    );
  }

  if (paymentProof.submission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Proof Submitted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Submitted {new Date(paymentProof.submission.submittedAt).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
            })}{" "}
            Pacific.
          </p>
          <p>
            <span className="font-medium">Method:</span>{" "}
            {paymentMethodDisplay(paymentProof.submission.paymentMethod)}
          </p>
          <p>
            <span className="font-medium">Reference:</span> {paymentProof.submission.paymentReference}
          </p>
          {paymentProof.submission.financeContactEmail ? (
            <p>
              <span className="font-medium">Finance contact:</span>{" "}
              {paymentProof.submission.financeContactEmail}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!paymentProof.canSubmit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Proof</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Payment proof submission opens the day after your event at 9:00 AM Pacific
          {paymentProof.opensAt ? ` (${formatOpensAt(paymentProof.opensAt)})` : ""}.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Payment Proof</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentProof.lateFee?.isOverdue ? (
          <p className="text-sm text-destructive">
            This payment is overdue. Accrued late fees: ${paymentProof.lateFee.lateFeeUsd.toFixed(2)}{" "}
            ($25/month starting the second month after due).
          </p>
        ) : paymentProof.lateFee && paymentProof.lateFee.weeksUntilLateFee > 0 ? (
          <p className="text-sm text-muted-foreground">
            Late fees of $25/month begin in {paymentProof.lateFee.weeksUntilLateFee}{" "}
            {paymentProof.lateFee.weeksUntilLateFee === 1 ? "week" : "weeks"} if payment proof is not
            submitted.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Submit the payment reference for your invoice. You can also add a finance officer or card
          coordinator email so they receive confirmation.
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-3">
              <Label>Payment method</Label>
              <div className="space-y-2">
                {PAYMENT_PROOF_METHOD_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer gap-3 rounded-lg border p-3 has-checked:border-primary"
                  >
                    <input
                      type="radio"
                      value={option.value}
                      checked={selectedMethod === option.value}
                      onChange={() => {
                        form.setValue("paymentMethod", option.value, { shouldDirty: true });
                        form.setValue("paymentReference", "", { shouldDirty: true });
                      }}
                      className="mt-1"
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-sm text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <TextFormField
              name="paymentReference"
              label={paymentProofReferenceLabel(selectedMethod)}
              placeholder={selectedOption.placeholder}
            />

            <TextFormField
              name="financeContactEmail"
              label="Finance officer / card coordinator email (optional)"
              type="email"
              placeholder="fo@example.stanford.edu"
              description="This person will also receive payment confirmation emails."
            />

            <Button type="submit" disabled={form.saveStatus === "saving"}>
              Submit payment proof
            </Button>
            {form.saveError ? <p className="text-sm text-destructive">{form.saveError}</p> : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
