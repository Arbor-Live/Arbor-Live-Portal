"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const normalRate = invoiceSettings?.crewNormalRateUsd ?? 0;
  const leadRate =
    invoiceSettings?.crewLeadRateUsd ?? invoiceSettings?.crewOtRateUsd ?? 0;

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Global Crew Rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Normal and Lead rates for invoice crew pricing and for users pinned to those modes.
            Empty shift cost estimates default to the average of both.
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
            Pin users to Normal or Lead (auto-syncs when globals change), or set a Custom fixed
            rate. Existing users stay Custom until pinned.
          </p>
          <div className="space-y-2">
            {rows.map((user) => (
              <UserRateRow
                key={user.id}
                userId={user.id}
                name={user.name}
                meta={[user.role, user.email, user.payrollMethod].filter(Boolean).join(" • ")}
                rateMode={user.rateMode ?? "custom"}
                customHourlyRateUsd={user.customHourlyRateUsd}
                effectiveHourlyRateUsd={user.hourlyRateUsd}
                normalRate={normalRate}
                leadRate={leadRate}
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
  rateMode,
  customHourlyRateUsd,
  effectiveHourlyRateUsd,
  normalRate,
  leadRate,
}: {
  userId: string;
  name: string;
  meta: string;
  rateMode: "normal" | "lead" | "custom";
  customHourlyRateUsd: number | null;
  effectiveHourlyRateUsd: number | null;
  normalRate: number;
  leadRate: number;
}) {
  const setCompensationRate = useMutation(api.users.setCompensationRate);

  const form = useConvexForm<UserRateFormValues>({
    schema: userRateSchema,
    defaultValues: {
      rateMode,
      hourlyRateUsd: customHourlyRateUsd ?? effectiveHourlyRateUsd ?? 0,
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({
      rateMode,
      hourlyRateUsd: customHourlyRateUsd ?? effectiveHourlyRateUsd ?? 0,
    });
  }, [rateMode, customHourlyRateUsd, effectiveHourlyRateUsd, form]);

  const watchedMode = form.watch("rateMode");
  const previewRate =
    watchedMode === "normal"
      ? normalRate
      : watchedMode === "lead"
        ? leadRate
        : form.watch("hourlyRateUsd");

  const onSave = form.submitMutation(
    async (values) => {
      await setCompensationRate({
        userId,
        rateMode: values.rateMode,
        hourlyRateUsd: values.rateMode === "custom" ? values.hourlyRateUsd : undefined,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  return (
    <div
      data-testid={`user-rate-row-${userId}`}
      className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1.4fr_24px]"
    >
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
        <p className="text-xs text-muted-foreground mt-1">Effective: ${previewRate}/hr</p>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSave)}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-[140px] space-y-1">
            <Label className="text-xs">Mode</Label>
            <Select
              value={form.watch("rateMode")}
              onValueChange={(value) =>
                form.setValue("rateMode", value as UserRateFormValues["rateMode"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal (${normalRate})</SelectItem>
                <SelectItem value="lead">Lead (${leadRate})</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {watchedMode === "custom" ? (
            <div className="min-w-0 flex-1">
              <TextFormField
                name="hourlyRateUsd"
                label="Custom USD"
                type="number"
                placeholder="Hourly rate (USD)"
              />
            </div>
          ) : null}
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
