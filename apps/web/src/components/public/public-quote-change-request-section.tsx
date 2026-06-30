"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  publicQuoteChangeRequestSchema,
  type PublicQuoteChangeRequestFormValues,
} from "@/lib/validations/crew-availability";

export function PublicQuoteChangeRequestSection({
  disabled,
  onRequestChanges,
}: {
  disabled: boolean;
  onRequestChanges: (note: string) => Promise<void>;
}) {
  const form = useConvexForm<PublicQuoteChangeRequestFormValues>({
    schema: publicQuoteChangeRequestSchema,
    defaultValues: { note: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    await onRequestChanges(values.note.trim());
    form.reset({ note: "" });
  });

  if (disabled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Changes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <TextareaFormField
              name="note"
              label=""
              placeholder="Tell us what changes are needed"
            />
            <Button type="submit" variant="outline" disabled={form.saveStatus === "saving"}>
              {form.saveStatus === "saving" ? "Sending..." : "Request changes"}
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
