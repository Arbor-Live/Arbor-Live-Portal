"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextFormField } from "@/components/forms/text-form-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  publicPaymentContactsSchema,
  type PublicPaymentContactsFormValues,
} from "@/lib/validations/crew-availability";

type PaymentContactsState = {
  clientIsPaymentSubmitter?: boolean;
  paymentSubmitterName?: string;
  paymentSubmitterEmail?: string;
};

export function PublicPaymentContactsSection({
  contacts,
  onSave,
}: {
  contacts: PaymentContactsState;
  onSave: (values: PublicPaymentContactsFormValues) => Promise<void>;
}) {
  const form = useConvexForm<PublicPaymentContactsFormValues>({
    schema: publicPaymentContactsSchema,
    defaultValues: {
      clientIsPaymentSubmitter: contacts.clientIsPaymentSubmitter ?? false,
      paymentSubmitterName: contacts.paymentSubmitterName ?? "",
      paymentSubmitterEmail: contacts.paymentSubmitterEmail ?? "",
    },
    mode: "onTouched",
  });

  const clientIsPaymentSubmitter = form.watch("clientIsPaymentSubmitter");

  const onSubmit = form.submitMutation(async (values) => {
    await onSave(values);
    form.reset(values);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment submitter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Payment requests and confirmations go to the person submitting payment. You can update this
          anytime before payment is received.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={clientIsPaymentSubmitter}
                onChange={(e) => {
                  form.setValue("clientIsPaymentSubmitter", e.target.checked, { shouldDirty: true });
                  if (e.target.checked) {
                    form.setValue("paymentSubmitterName", "", { shouldDirty: true });
                    form.setValue("paymentSubmitterEmail", "", { shouldDirty: true });
                  }
                }}
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

            <Button type="submit" variant="outline" disabled={form.saveStatus === "saving"}>
              {form.saveStatus === "saving" ? "Saving..." : "Save payment submitter"}
            </Button>

            {form.saveError ? (
              <Alert variant="destructive">
                <AlertDescription>{form.saveError}</AlertDescription>
              </Alert>
            ) : null}

            {form.saveStatus === "saved" ? (
              <Alert>
                <AlertDescription>Payment submitter updated.</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
