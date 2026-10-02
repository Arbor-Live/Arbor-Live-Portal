"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { GlobeIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { FormSaveBar } from "@/components/forms";
import { TextFormField } from "@/components/forms/text-form-field";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useConvexForm } from "@/hooks/use-convex-form";
import { api } from "@/lib/convex-api";
import {
  lostFoundSettingsSchema,
  type LostFoundSettingsFormValues,
} from "@/lib/validations/inventory";

type LostFoundFormProps = {
  initial: LostFoundSettingsFormValues;
  readOnly: boolean;
};

function LostFoundForm({ initial, readOnly }: LostFoundFormProps) {
  const updateSettings = useMutation(api.lostFoundSettings.update);

  const form = useConvexForm<LostFoundSettingsFormValues>({
    schema: lostFoundSettingsSchema,
    defaultValues: initial,
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(initial);
  }, [initial, form]);

  const persist = async (values: LostFoundSettingsFormValues) => {
    await updateSettings({
      instructions: values.instructions?.trim() || undefined,
      contactEmail: values.contactEmail?.trim() || undefined,
      infoUrl: values.infoUrl?.trim() || undefined,
    });
  };

  const onSave = form.submitMutation(
    async (values) => {
      await persist(values);
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  return (
    <>
      <Card data-testid="lost-found-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="size-4 text-muted-foreground" aria-hidden />
            Public return instructions
          </CardTitle>
          <CardDescription>
            Shown on the public page of every tagged item, the page a scanned tag opens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="max-w-2xl space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!readOnly) void form.handleSubmit(onSave)();
              }}
            >
              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Return instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        rows={5}
                        disabled={readOnly}
                        placeholder="Where to bring found gear, opening hours, which desk to ask at…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextFormField
                name="contactEmail"
                label="Contact email (optional)"
                type="email"
                disabled={readOnly}
                placeholder="equipment@example.com"
              />
              <TextFormField
                name="infoUrl"
                label="More info link (optional)"
                disabled={readOnly}
                placeholder="https://…"
                description="A page with more detail, such as a map to the drop-off point."
              />
            </form>
          </Form>
        </CardContent>
      </Card>

      {readOnly ? null : (
        <FormSaveBar
          tier="C"
          saveStatus={form.saveStatus}
          saveError={form.saveError}
          isDirty={form.formState.isDirty}
          onSave={() => void form.handleSubmit(onSave)()}
          onDiscard={() => form.reset(initial)}
          onRetry={() => void form.handleSubmit(onSave)()}
        />
      )}
    </>
  );
}

export function LostFoundSettingsManager() {
  const settings = useQuery(api.lostFoundSettings.get, {});
  const viewer = useSessionViewer();
  const readOnly = !viewer?.isAdmin;

  if (settings === undefined) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="max-w-2xl space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const initial: LostFoundSettingsFormValues = {
    instructions: settings?.instructions ?? "",
    contactEmail: settings?.contactEmail ?? "",
    infoUrl: settings?.infoUrl ?? "",
  };

  const versionKey = settings ? `${settings._id}-${settings.updatedAt}` : "none";

  return (
    <>
      {readOnly ? (
        <Alert>
          <LockSimpleIcon className="size-4" />
          <AlertTitle>Read-only view</AlertTitle>
          <AlertDescription>You can see these instructions, but only admins can change them.</AlertDescription>
        </Alert>
      ) : null}
      <LostFoundForm key={versionKey} initial={initial} readOnly={readOnly} />
    </>
  );
}
