"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  globalCrewRatesSchema,
  userRateSchema,
  type GlobalCrewRatesFormValues,
  type UserRateFormValues,
} from "@/lib/validations/financial";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";

export function UserRatesAdminClient() {
  const users = useQuery(api.users.listWithRates, {});
  const invoiceSettings = useQuery(api.invoiceSettings.get, {});
  const updateInvoiceSettings = useMutation(api.invoiceSettings.update);

  const globalForm = useConvexForm<GlobalCrewRatesFormValues>({
    schema: globalCrewRatesSchema,
    defaultValues: { defaultCrewRateUsd: 0, defaultLeadRateUsd: 0 },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!invoiceSettings) return;
    if (globalForm.formState.isDirty) return;
    globalForm.reset({
      defaultCrewRateUsd: invoiceSettings.crewNormalRateUsd ?? 0,
      defaultLeadRateUsd:
        invoiceSettings.crewLeadRateUsd ?? invoiceSettings.crewOtRateUsd ?? 0,
    });
  }, [invoiceSettings, globalForm]);

  const onSaveGlobalRates = globalForm.submitMutation(async (values) => {
    await updateInvoiceSettings({
      crewNormalRateUsd: values.defaultCrewRateUsd,
      crewLeadRateUsd: values.defaultLeadRateUsd,
      crewOtRateUsd: values.defaultLeadRateUsd,
    });
  });

  const rows = useMemo(() => users ?? [], [users]);

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Crew Rate Modes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Invoices support three crew pricing modes: Normal, Lead, and Custom (per row).
          </p>
          <Form {...globalForm}>
            <form
              onSubmit={globalForm.handleSubmit(onSaveGlobalRates)}
              className="grid gap-3 md:grid-cols-3"
            >
              <TextFormField
                name="defaultCrewRateUsd"
                label="Normal Rate (USD)"
                type="number"
              />
              <TextFormField
                name="defaultLeadRateUsd"
                label="Lead Rate (USD)"
                type="number"
              />
              <div className="flex items-end">
                <Button type="submit" disabled={globalForm.saveStatus === "saving"}>
                  Save Global Crew Rates
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Compensation Rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Admin only: set each user hourly rate used for event crew cost calculations.
          </p>
          <div className="space-y-2">
            {rows.map((user) => (
              <UserRateRow
                key={user.id}
                userId={user.id}
                name={user.name}
                meta={[user.role, user.email].filter(Boolean).join(" • ")}
                hourlyRateUsd={user.hourlyRateUsd}
              />
            ))}
            {users === undefined ? (
              <p className="text-sm text-muted-foreground">Loading users...</p>
            ) : null}
            {users?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={globalForm.saveStatus}
        saveError={globalForm.saveError}
        isDirty={globalForm.formState.isDirty}
        saveLabel="Save Global Crew Rates"
        onSave={() => void globalForm.handleSubmit(onSaveGlobalRates)()}
        onDiscard={() => {
          if (!invoiceSettings) return;
          globalForm.reset({
            defaultCrewRateUsd: invoiceSettings.crewNormalRateUsd ?? 0,
            defaultLeadRateUsd:
              invoiceSettings.crewLeadRateUsd ?? invoiceSettings.crewOtRateUsd ?? 0,
          });
        }}
        onRetry={() => void globalForm.handleSubmit(onSaveGlobalRates)()}
      />
    </div>
  );
}

function UserRateRow({
  userId,
  name,
  meta,
  hourlyRateUsd,
}: {
  userId: string;
  name: string;
  meta: string;
  hourlyRateUsd: number | null;
}) {
  const setHourlyRate = useMutation(api.users.setHourlyRate);

  const form = useConvexForm<UserRateFormValues>({
    schema: userRateSchema,
    defaultValues: { hourlyRateUsd: hourlyRateUsd ?? 0 },
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({ hourlyRateUsd: hourlyRateUsd ?? 0 });
  }, [hourlyRateUsd, form]);

  const onSave = form.submitMutation(
    async (values) => {
      await setHourlyRate({ userId, hourlyRateUsd: values.hourlyRateUsd });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  return (
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_24px]">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSave)}
          className="flex items-end gap-2"
        >
          <div className="min-w-0 flex-1">
            <TextFormField
              name="hourlyRateUsd"
              label=""
              type="number"
              placeholder="Hourly rate (USD)"
            />
          </div>
          {form.formState.isDirty ? (
            <Button type="submit" size="sm" disabled={form.saveStatus === "saving"}>
              Save
            </Button>
          ) : null}
        </form>
      </Form>
      <span className="flex self-center justify-end">
        {form.saveStatus === "saving" ? (
          <CircleNotchIcon className="size-4 animate-spin text-muted-foreground" />
        ) : form.saveStatus === "error" ? (
          <WarningCircleIcon
            className="size-4 text-destructive"
            weight="fill"
            aria-label={form.saveError ?? "Save failed"}
          />
        ) : form.saveStatus === "saved" ? (
          <CheckIcon className="size-4 text-emerald-600" weight="bold" />
        ) : null}
      </span>
    </div>
  );
}
