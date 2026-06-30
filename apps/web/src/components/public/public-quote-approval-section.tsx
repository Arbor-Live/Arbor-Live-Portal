"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextFormField } from "@/components/forms/text-form-field";
import { MarkdownContent } from "@/components/markdown-content";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  publicQuoteApprovalSchema,
  type PublicQuoteApprovalFormValues,
} from "@/lib/validations/crew-availability";

type InvoiceApprovalState = {
  clientApprovalStatus: "pending" | "approved" | "changes_requested";
  approvedAt?: number;
  changesRequestedAt?: number;
  clientApprovalSignedName?: string;
};

function formatApprovalDate(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PaymentSubmitterFields({
  clientIsPaymentSubmitter,
  onClientIsPaymentSubmitterChange,
}: {
  clientIsPaymentSubmitter: boolean;
  onClientIsPaymentSubmitterChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="font-medium">Who will submit payment?</p>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={clientIsPaymentSubmitter}
          onChange={(e) => onClientIsPaymentSubmitterChange(e.target.checked)}
          className="mt-1"
        />
        <span>I will be submitting the payment</span>
      </label>

      {!clientIsPaymentSubmitter ? (
        <div className="space-y-3">
          <TextFormField
            name="paymentSubmitterName"
            label="Financial Officer or Paying party name"
            placeholder="Name"
          />
          <TextFormField
            name="paymentSubmitterEmail"
            label="Financial Officer or Paying party email"
            type="email"
            placeholder="fo@example.stanford.edu"
          />
        </div>
      ) : null}
    </div>
  );
}

export function PublicQuoteApprovalSection({
  invoice,
  termsAndConditionsMarkdown,
  termsVersion,
  onApprove,
}: {
  invoice: InvoiceApprovalState;
  termsAndConditionsMarkdown: string;
  termsVersion: string;
  onApprove: (values: PublicQuoteApprovalFormValues) => Promise<void>;
}) {
  const pending = invoice.clientApprovalStatus === "pending";

  const form = useConvexForm<PublicQuoteApprovalFormValues>({
    schema: publicQuoteApprovalSchema,
    defaultValues: {
      signedName: "",
      clientIsPaymentSubmitter: false,
      paymentSubmitterName: "",
      paymentSubmitterEmail: "",
    },
    mode: "onTouched",
  });

  const clientIsPaymentSubmitter = form.watch("clientIsPaymentSubmitter");

  const onSubmit = form.submitMutation(async (values) => {
    await onApprove(values);
    form.reset();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms & Conditions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <MarkdownContent>{termsAndConditionsMarkdown || "_No terms configured._"}</MarkdownContent>
        <p className="text-muted-foreground">Terms version {termsVersion}.</p>

        {invoice.clientApprovalStatus === "approved" && invoice.approvedAt ? (
          <Alert>
            <AlertDescription>
              Approved on {formatApprovalDate(invoice.approvedAt)} Pacific
              {invoice.clientApprovalSignedName ? ` by ${invoice.clientApprovalSignedName}` : ""}.
            </AlertDescription>
          </Alert>
        ) : null}

        {invoice.clientApprovalStatus === "changes_requested" && invoice.changesRequestedAt ? (
          <Alert>
            <AlertDescription>
              Changes requested on {formatApprovalDate(invoice.changesRequestedAt)} Pacific. Our team
              will follow up with an updated quote.
            </AlertDescription>
          </Alert>
        ) : null}

        {pending ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border-t pt-4">
              <p className="text-muted-foreground">
                By typing your name below, you electronically sign and agree to these terms.
              </p>
              <TextFormField
                name="signedName"
                label="Full legal name (e-signature)"
                placeholder="Jordan Lee"
                autoComplete="name"
              />

              <PaymentSubmitterFields
                clientIsPaymentSubmitter={clientIsPaymentSubmitter}
                onClientIsPaymentSubmitterChange={(checked) => {
                  form.setValue("clientIsPaymentSubmitter", checked, { shouldDirty: true });
                  if (checked) {
                    form.setValue("paymentSubmitterName", "", { shouldDirty: true });
                    form.setValue("paymentSubmitterEmail", "", { shouldDirty: true });
                  }
                }}
              />

              <Button type="submit" disabled={form.saveStatus === "saving"}>
                {form.saveStatus === "saving" ? "Approving..." : "Approve quote"}
              </Button>

              {form.saveError ? (
                <Alert variant="destructive">
                  <AlertDescription>{form.saveError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          </Form>
        ) : null}
      </CardContent>
    </Card>
  );
}
