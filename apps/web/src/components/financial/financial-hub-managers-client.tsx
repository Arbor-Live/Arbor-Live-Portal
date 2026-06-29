"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    form.reset({ title, phone });
    form.suppressNextAutoSave();
  }, [title, phone, form]);

  const persist = async (values: ManagerProfileFormValues) => {
    await updateUserAdmin({
      userId,
      title: values.title?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
    });
  };

  const watched = form.watch();
  useEffect(() => {
    form.debouncedAutoSave(persist, { delayMs: 800, enabled: form.formState.isDirty });
  }, [watched, form]);

  return (
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_180px_160px_80px_24px]">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <Form {...form}>
        <form className="contents md:col-span-2 md:grid md:grid-cols-2 md:gap-2">
          <TextFormField name="title" label="" placeholder="Title" />
          <TextFormField name="phone" label="" placeholder="Phone" type="tel" />
        </form>
      </Form>
      <span className="self-center text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</span>
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
          communications. Changes save automatically.
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
