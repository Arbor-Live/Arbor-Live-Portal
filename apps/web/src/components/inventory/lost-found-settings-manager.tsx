"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  lostFoundSettingsSchema,
  type LostFoundSettingsFormValues,
} from "@/lib/validations/inventory";

type LostFoundFormProps = {
  initial: LostFoundSettingsFormValues;
};

function LostFoundForm({ initial }: LostFoundFormProps) {
  const updateSettings = useMutation(api.lostFoundSettings.update);

  const form = useConvexForm<LostFoundSettingsFormValues>({
    schema: lostFoundSettingsSchema,
    defaultValues: initial,
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(initial);
    form.suppressNextAutoSave();
  }, [initial, form]);

  const persist = async (values: LostFoundSettingsFormValues) => {
    await updateSettings({
      instructions: values.instructions?.trim() || undefined,
      contactEmail: values.contactEmail?.trim() || undefined,
      infoUrl: values.infoUrl?.trim() || undefined,
    });
  };

  const watched = form.watch();
  useEffect(() => {
    form.debouncedAutoSave(persist, { delayMs: 1000, enabled: form.formState.isDirty });
  }, [watched, form]);

  return (
    <>
      <Card className="pb-20">
        <CardHeader>
          <CardTitle>Public Lost &amp; Found copy</CardTitle>
          <p className="text-sm text-muted-foreground">
            This text appears on every public equipment page at{" "}
            <span className="font-mono">/e/[asset ID]</span> for registered assets. Return instructions and contact
            info are shared globally — not per item.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form className="space-y-4">
              <TextareaFormField
                name="instructions"
                label="Return instructions"
                placeholder="Where to bring found equipment, hours, desk location, etc."
              />
              <TextFormField
                name="contactEmail"
                label="Contact email (optional)"
                type="email"
                placeholder="equipment@example.com"
              />
              <TextFormField
                name="infoUrl"
                label="More info URL (optional)"
                placeholder="https://..."
              />
            </form>
          </Form>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="B"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        onSave={() => void form.handleSubmit((values) => form.runMutation(() => persist(values)))()}
        onRetry={() => void form.handleSubmit((values) => form.runMutation(() => persist(values)))()}
      />
    </>
  );
}

export function LostFoundSettingsManager() {
  const settings = useQuery(api.lostFoundSettings.get, {});

  if (settings === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const initial: LostFoundSettingsFormValues = {
    instructions: settings?.instructions ?? "",
    contactEmail: settings?.contactEmail ?? "",
    infoUrl: settings?.infoUrl ?? "",
  };

  const versionKey = settings ? `${settings._id}-${settings.updatedAt}` : "none";

  return <LostFoundForm key={versionKey} initial={initial} />;
}
