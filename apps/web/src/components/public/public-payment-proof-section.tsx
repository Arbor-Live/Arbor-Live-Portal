"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextFormField } from "@/components/forms/text-form-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  PAYMENT_PROOF_METHOD_OPTIONS,
  paymentProofReferenceLabel,
  paymentProofSubmissionSchema,
  type PaymentProofSubmissionFormValues,
} from "@/lib/validations/payment-proof";
import { formatDate, formatDateTime, formatUsd, pacificDateKey } from "@/lib/format";

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
};

function formatDueDate(dueAt: number) {
  return formatDate(dueAt);
}

/** Whole Pacific calendar days from today until due (0 = due today; negative = past). */
function pacificDaysUntil(dueAt: number, nowMs = Date.now()) {
  const today = pacificDateKey(nowMs);
  const due = pacificDateKey(dueAt);
  const todayMs = Date.parse(`${today}T12:00:00Z`);
  const dueMs = Date.parse(`${due}T12:00:00Z`);
  return Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000));
}

function paymentDueBannerCopy(dueAt: number) {
  const days = pacificDaysUntil(dueAt);
  const dueLabel = formatDueDate(dueAt);
  if (days > 1) {
    return `Payment is due by ${dueLabel} (${days} days left). No rush — take the time you need.`;
  }
  if (days === 1) {
    return `Payment is due by ${dueLabel} (tomorrow). No rush — take the time you need.`;
  }
  if (days === 0) {
    return `Payment is due today (${dueLabel}).`;
  }
  return `Payment was due ${dueLabel}.`;
}

function paymentMethodDisplay(method: PaymentProofSubmissionFormValues["paymentMethod"]) {
  return PAYMENT_PROOF_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

function PaymentDueBanner({ lateFee }: { lateFee: NonNullable<PaymentProofState["lateFee"]> }) {
  if (lateFee.isOverdue) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="space-y-1">
          <p className="font-medium">This payment is past due.</p>
          <p>
            Payment was due {formatDueDate(lateFee.dueAt)}.
            {lateFee.lateFeeUsd > 0
              ? ` Accrued late fees: ${formatUsd(lateFee.lateFeeUsd)} ($25/month after the first month past due).`
              : " Late fees of $25/month apply after the first month past due."}
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertDescription>{paymentDueBannerCopy(lateFee.dueAt)}</AlertDescription>
    </Alert>
  );
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
    });
    form.reset({
      paymentMethod: values.paymentMethod,
      paymentReference: "",
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
          {paymentProof.lateFee ? <PaymentDueBanner lateFee={paymentProof.lateFee} /> : null}
          <p className="text-muted-foreground">
            Submitted {formatDateTime(paymentProof.submission.submittedAt)}
          </p>
          <p>
            <span className="font-medium">Method:</span>{" "}
            {paymentMethodDisplay(paymentProof.submission.paymentMethod)}
          </p>
          <p>
            <span className="font-medium">Reference:</span> {paymentProof.submission.paymentReference}
          </p>
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
        {paymentProof.lateFee ? <PaymentDueBanner lateFee={paymentProof.lateFee} /> : null}

        <p className="text-sm text-muted-foreground">
          Submit the payment reference for your invoice once payment has been initiated.
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

            <Button type="submit" disabled={form.saveStatus === "saving" || !paymentProof.canSubmit}>
              {form.saveStatus === "saving" ? "Submitting..." : "Submit payment proof"}
            </Button>

            {form.saveError ? (
              <Alert variant="destructive">
                <AlertDescription>{form.saveError}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
