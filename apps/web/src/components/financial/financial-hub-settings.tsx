"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  feeDefinitionSchema,
  termsDefinitionSchema,
  type FeeDefinitionFormValues,
  type TermsDefinitionFormValues,
} from "@/lib/validations/financial";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Id } from "@/lib/convex-api";

export function FinancialHubSettings() {
  const fees = useQuery(api.invoiceFeeDefinitions.list, {});
  const terms = useQuery(api.invoiceTerms.list, {});
  const invoiceSettings = useQuery(api.invoiceSettings.get, {});
  const updateInvoiceSettings = useMutation(api.invoiceSettings.update);
  const [crewBufferOverride, setCrewBufferOverride] = useState<string | null>(null);
  const [bufferMessage, setBufferMessage] = useState<string | null>(null);
  const crewBufferPercent =
    crewBufferOverride ??
    (invoiceSettings?.crewCostBufferPercent !== undefined
      ? String(invoiceSettings.crewCostBufferPercent)
      : "");

  const addFeeForm = useConvexForm<FeeDefinitionFormValues>({
    schema: feeDefinitionSchema,
    defaultValues: { key: "", label: "", defaultAmountUsd: 0 },
    mode: "onTouched",
  });

  const addTermsForm = useConvexForm<TermsDefinitionFormValues>({
    schema: termsDefinitionSchema,
    defaultValues: { label: "", version: "v1", markdown: "" },
    mode: "onTouched",
  });

  const createFee = useMutation(api.invoiceFeeDefinitions.create);
  const createTerms = useMutation(api.invoiceTerms.create);

  const onAddFee = addFeeForm.submitMutation(async (values) => {
    await createFee({
      key: values.key.trim(),
      label: values.label.trim(),
      defaultAmountUsd: values.defaultAmountUsd,
      active: true,
    });
    addFeeForm.reset({ key: "", label: "", defaultAmountUsd: 0 });
  });

  const onAddTerms = addTermsForm.submitMutation(async (values) => {
    await createTerms({
      label: values.label.trim(),
      version: values.version.trim(),
      markdown: values.markdown,
      active: true,
    });
    addTermsForm.reset({ label: "", version: "v1", markdown: "" });
  });

  return (
    <div className="grid gap-4 pb-24 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Fee Definitions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(fees ?? []).map((fee) => (
            <FeeRow key={fee._id} fee={fee} />
          ))}
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Add fee</p>
            <Form {...addFeeForm}>
              <form onSubmit={addFeeForm.handleSubmit(onAddFee)} className="grid gap-2">
                <TextFormField name="key" label="" placeholder="Key (e.g. labor_fee)" />
                <TextFormField name="label" label="" placeholder="Label" />
                <TextFormField
                  name="defaultAmountUsd"
                  label=""
                  placeholder="Default amount"
                  type="number"
                />
                <Button type="submit" disabled={addFeeForm.saveStatus === "saving"}>
                  Add Fee
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(terms ?? []).map((term) => (
            <TermsRow key={term._id} term={term} />
          ))}
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Add terms template</p>
            <Form {...addTermsForm}>
              <form onSubmit={addTermsForm.handleSubmit(onAddTerms)} className="grid gap-2">
                <TextFormField name="label" label="Label" />
                <TextFormField name="version" label="Version" />
                <TextareaFormField name="markdown" label="Markdown" />
                <Button type="submit" disabled={addTermsForm.saveStatus === "saving"}>
                  Add Terms
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crew Cost Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Global default buffer applied to crew cost estimates unless overridden per event.
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="crew-buffer-percent">
              Crew cost buffer %
            </label>
            <input
              id="crew-buffer-percent"
              type="number"
              min={0}
              step={0.5}
              className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
              value={crewBufferPercent}
              onChange={(e) => setCrewBufferOverride(e.target.value)}
            />
          </div>
          {bufferMessage ? <p className="text-xs text-emerald-700">{bufferMessage}</p> : null}
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await updateInvoiceSettings({
                crewCostBufferPercent: Number(crewBufferPercent || "0"),
              });
              setCrewBufferOverride(null);
              setBufferMessage("Crew cost buffer saved.");
            }}
          >
            Save crew buffer
          </Button>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={
          addFeeForm.saveStatus !== "idle"
            ? addFeeForm.saveStatus
            : addTermsForm.saveStatus
        }
        saveError={addFeeForm.saveError ?? addTermsForm.saveError}
        isDirty={addFeeForm.formState.isDirty || addTermsForm.formState.isDirty}
        saveLabel="Save"
        onSave={() => {
          if (addFeeForm.formState.isDirty) void addFeeForm.handleSubmit(onAddFee)();
          if (addTermsForm.formState.isDirty) void addTermsForm.handleSubmit(onAddTerms)();
        }}
        onDiscard={() => {
          addFeeForm.reset({ key: "", label: "", defaultAmountUsd: 0 });
          addTermsForm.reset({ label: "", version: "v1", markdown: "" });
        }}
        onRetry={() => {
          if (addFeeForm.formState.isDirty) void addFeeForm.handleSubmit(onAddFee)();
          if (addTermsForm.formState.isDirty) void addTermsForm.handleSubmit(onAddTerms)();
        }}
      />
    </div>
  );
}

function FeeRow({
  fee,
}: {
  fee: {
    _id: Id<"invoiceFeeDefinitions">;
    key: string;
    label: string;
    defaultAmountUsd?: number;
    active: boolean;
  };
}) {
  const updateFee = useMutation(api.invoiceFeeDefinitions.update);
  const removeFee = useMutation(api.invoiceFeeDefinitions.remove);

  const form = useConvexForm<{ defaultAmountUsd: number }>({
    schema: feeDefinitionSchema.pick({ defaultAmountUsd: true }),
    defaultValues: { defaultAmountUsd: fee.defaultAmountUsd ?? 0 },
    mode: "onChange",
  });

  const [toggleSaving, setToggleSaving] = useState(false);

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({ defaultAmountUsd: fee.defaultAmountUsd ?? 0 });
  }, [fee.defaultAmountUsd, form]);

  const persist = async (values: { defaultAmountUsd: number }) => {
    await updateFee({ id: fee._id, defaultAmountUsd: values.defaultAmountUsd });
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
    <div className="rounded-md border p-3 text-sm">
      <p className="font-medium">{fee.label}</p>
      <p className="text-xs text-muted-foreground">{fee.key}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Form {...form}>
          <form className="flex flex-1 flex-wrap items-end gap-2" onSubmit={form.handleSubmit(onSave)}>
            <TextFormField name="defaultAmountUsd" label="" type="number" />
            {form.formState.isDirty ? (
              <Button type="submit" size="sm" disabled={form.saveStatus === "saving"}>
                Save
              </Button>
            ) : null}
          </form>
        </Form>
        <Button
          type="button"
          variant="outline"
          disabled={toggleSaving}
          onClick={async () => {
            setToggleSaving(true);
            await form.runMutation(() => updateFee({ id: fee._id, active: !fee.active }));
            setToggleSaving(false);
          }}
        >
          {fee.active ? "Disable" : "Enable"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void form.runMutation(() => removeFee({ id: fee._id }))}
        >
          Delete
        </Button>
        <RowSaveIndicator status={form.saveStatus} error={form.saveError} />
      </div>
    </div>
  );
}

function TermsRow({
  term,
}: {
  term: {
    _id: Id<"invoiceTerms">;
    label: string;
    version: string;
    markdown: string;
    active: boolean;
  };
}) {
  const updateTerms = useMutation(api.invoiceTerms.update);
  const removeTerms = useMutation(api.invoiceTerms.remove);

  const form = useConvexForm<{ markdown: string }>({
    schema: termsDefinitionSchema.pick({ markdown: true }),
    defaultValues: { markdown: term.markdown },
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({ markdown: term.markdown });
  }, [term.markdown, form]);

  const persist = async (values: { markdown: string }) => {
    await updateTerms({ id: term._id, markdown: values.markdown });
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
    <div className="rounded-md border p-3 text-sm">
      <p className="font-medium">
        {term.label} ({term.version})
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)}>
          <TextareaFormField name="markdown" label="" className="min-h-20" />
          {form.formState.isDirty ? (
            <Button type="submit" size="sm" className="mt-2" disabled={form.saveStatus === "saving"}>
              Save
            </Button>
          ) : null}
        </form>
      </Form>
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void form.runMutation(() => updateTerms({ id: term._id, active: !term.active }))
          }
        >
          {term.active ? "Disable" : "Enable"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void form.runMutation(() => removeTerms({ id: term._id }))}
        >
          Delete
        </Button>
        <RowSaveIndicator status={form.saveStatus} error={form.saveError} />
      </div>
    </div>
  );
}

function RowSaveIndicator({
  status,
  error,
}: {
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
}) {
  if (status === "saving") {
    return <CircleNotchIcon className="size-4 animate-spin self-center text-muted-foreground" />;
  }
  if (status === "error") {
    return (
      <WarningCircleIcon
        className="size-4 self-center text-destructive"
        weight="fill"
        aria-label={error ?? "Save failed"}
      />
    );
  }
  if (status === "saved") {
    return <CheckIcon className="size-4 self-center text-emerald-600" weight="bold" />;
  }
  return null;
}
