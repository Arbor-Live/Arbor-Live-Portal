"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  managerProfileSchema,
  type ManagerProfileFormValues,
} from "@/lib/validations/financial";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";

function ManagerRow({
  userId,
  title,
  phone,
  name,
  meta,
  active,
}: {
  userId: string;
  title: string;
  phone: string;
  name: string;
  meta: string;
  active: boolean;
}) {
  const updateUserAdmin = useMutation(api.users.updateUserAdmin);

  const form = useConvexForm<ManagerProfileFormValues>({
    schema: managerProfileSchema,
    defaultValues: { title, phone },
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({ title, phone });
  }, [title, phone, form]);

  const persist = async (values: ManagerProfileFormValues) => {
    await updateUserAdmin({
      userId,
      title: values.title?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
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
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_180px_160px_auto_24px]">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <Form {...form}>
        <form
          className="contents md:col-span-2 md:grid md:grid-cols-2 md:gap-2"
          onSubmit={form.handleSubmit(onSave)}
        >
          <TextFormField name="title" label="" placeholder="Title" />
          <TextFormField name="phone" label="" placeholder="Phone" type="tel" />
        </form>
      </Form>
      <span className="self-center text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</span>
      <div className="flex items-center gap-2 self-center justify-end">
        {form.formState.isDirty ? (
          <Button type="button" size="sm" disabled={form.saveStatus === "saving"} onClick={() => void form.handleSubmit(onSave)()}>
            Save
          </Button>
        ) : null}
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
      </div>
    </div>
  );
}

export function FinancialHubManagersClient() {
  const managers = useQuery(api.invoices.listInvoiceManagersForAdmin, {});

  if (managers === undefined) {
    return <p className="text-sm text-muted-foreground">Loading managers…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice managers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Users who can be assigned as the invoice manager. Title and phone appear on quotes and client
          communications. Click Save after editing a row.
        </p>
        <div className="space-y-2">
          {managers.map((manager) => (
            <ManagerRow
              key={manager.id}
              userId={manager.id}
              title={manager.title}
              phone={manager.phone}
              name={manager.name}
              meta={[manager.role, manager.email].filter(Boolean).join(" • ")}
              active={manager.active}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
