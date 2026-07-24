"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/lib/convex-api";
import { api } from "@/lib/convex-api";
import {
  INVOICE_GROUP_TYPE_LABELS,
  INVOICE_GROUP_TYPE_OPTIONS,
  EQUIPMENT_PRICING_MODE_LABELS,
  EQUIPMENT_PRICING_MODE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  invoiceContactSchema,
  invoiceGroupSchema,
  type InvoiceContactFormValues,
  type InvoiceGroupFormValues,
} from "@/lib/validations/financial";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";

type GroupType = InvoiceGroupFormValues["type"];

const emptyContactDefaults: InvoiceContactFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

export function FinancialHubOrganizationsClient() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<Id<"invoiceGroups"> | "">("");

  const groups = useQuery(api.invoiceGroups.listForAdmin, { includeInactive });
  const contacts = useQuery(
    api.invoiceContacts.listForAdmin,
    selectedGroupId ? { groupId: selectedGroupId, includeInactive } : "skip",
  );

  const createGroup = useMutation(api.invoiceGroups.create);
  const archiveGroup = useMutation(api.invoiceGroups.archive);
  const createContact = useMutation(api.invoiceContacts.create);
  const archiveContact = useMutation(api.invoiceContacts.archive);

  const groupRows = useMemo(() => groups ?? [], [groups]);
  const contactRows = useMemo(() => contacts ?? [], [contacts]);
  const selectedGroup = groupRows.find((group) => group._id === selectedGroupId);
  const selectedGroupInitial = useMemo(
    () =>
      selectedGroup
        ? {
            name: selectedGroup.name,
            type: selectedGroup.type,
            equipmentPricingMode: selectedGroup.equipmentPricingMode,
          }
        : null,
    [selectedGroup],
  );

  const newGroupForm = useConvexForm<InvoiceGroupFormValues>({
    schema: invoiceGroupSchema,
    defaultValues: {
      name: "",
      type: "vso",
      equipmentPricingMode: "subsidized",
    },
    mode: "onTouched",
  });

  const newContactForm = useConvexForm<InvoiceContactFormValues>({
    schema: invoiceContactSchema,
    defaultValues: emptyContactDefaults,
    mode: "onTouched",
  });

  const onCreateGroup = newGroupForm.submitMutation(async (values) => {
    const id = await createGroup({
      name: values.name.trim(),
      type: values.type,
      equipmentPricingMode: values.equipmentPricingMode,
      active: true,
    });
    newGroupForm.reset({ name: "", type: "vso", equipmentPricingMode: "subsidized" });
    setSelectedGroupId(id);
  });

  const onCreateContact = newContactForm.submitMutation(async (values) => {
    if (!selectedGroupId) return;
    await createContact({
      groupId: selectedGroupId,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      active: true,
    });
    newContactForm.reset(emptyContactDefaults);
  });

  async function handleArchiveGroup() {
    if (!selectedGroupId) return;
    if (!window.confirm("Archive this host organization? It will no longer appear in invoice dropdowns.")) {
      return;
    }
    await archiveGroup({ id: selectedGroupId });
    setSelectedGroupId("");
  }

  async function handleArchiveContact(contactId: Id<"invoiceContacts">) {
    if (!window.confirm("Archive this client contact?")) return;
    await archiveContact({ id: contactId });
  }

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Host organizations</CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show archived
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Host orgs appear on invoices and booking requests. Link invoices to a host using the dropdown — not
            freeform text.
          </p>

          <Form {...newGroupForm}>
            <form
              onSubmit={newGroupForm.handleSubmit(onCreateGroup)}
              className="grid gap-3 md:grid-cols-[1fr_160px_180px_120px]"
            >
              <TextFormField name="name" label="" placeholder="New host name" />
              <div className="space-y-1">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={newGroupForm.watch("type")}
                  onChange={(e) =>
                    newGroupForm.setValue("type", e.target.value as GroupType, { shouldDirty: true })
                  }
                >
                  {INVOICE_GROUP_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={newGroupForm.watch("equipmentPricingMode")}
                  onChange={(e) =>
                    newGroupForm.setValue(
                      "equipmentPricingMode",
                      e.target.value as EquipmentPricingMode,
                      { shouldDirty: true },
                    )
                  }
                >
                  {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={newGroupForm.saveStatus === "saving"}>
                Add host
              </Button>
            </form>
          </Form>

          <div className="space-y-2">
            {groupRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No host organizations yet.</p>
            ) : (
              groupRows.map((group) => (
                <button
                  key={group._id}
                  type="button"
                  onClick={() => setSelectedGroupId(group._id)}
                  className={`grid w-full gap-2 rounded-md border p-3 text-left transition hover:bg-muted/40 md:grid-cols-[1fr_120px_140px_100px_80px] ${
                    selectedGroupId === group._id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {INVOICE_GROUP_TYPE_LABELS[group.type] ?? group.type}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {EQUIPMENT_PRICING_MODE_LABELS[group.equipmentPricingMode]}
                  </span>
                  <span className="text-sm text-muted-foreground">{group.contactCount} clients</span>
                  <span className="text-sm text-muted-foreground">{group.active ? "Active" : "Archived"}</span>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {selectedGroup ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit host: {selectedGroup.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <EditGroupForm
              key={selectedGroup._id}
              groupId={selectedGroup._id}
              initial={selectedGroupInitial!}
              active={selectedGroup.active}
              onArchive={() => void handleArchiveGroup()}
            />

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Client contacts</p>
              <Form {...newContactForm}>
                <form
                  onSubmit={newContactForm.handleSubmit(onCreateContact)}
                  className="mb-3 grid gap-3 md:grid-cols-5"
                >
                  <TextFormField name="firstName" label="" placeholder="First name" />
                  <TextFormField name="lastName" label="" placeholder="Last name" />
                  <TextFormField name="email" label="" placeholder="Email" type="email" />
                  <TextFormField name="phone" label="" placeholder="Phone" type="tel" />
                  <Button type="submit" variant="outline" disabled={newContactForm.saveStatus === "saving"}>
                    Add client
                  </Button>
                </form>
              </Form>

              <div className="space-y-2">
                {contactRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clients linked to this host yet.</p>
                ) : (
                  contactRows.map((contact) => (
                    <ContactRow
                      key={contact._id}
                      contact={contact}
                      onArchive={() => void handleArchiveContact(contact._id)}
                    />
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <FormSaveBar
        tier="C"
        saveStatus={
          newGroupForm.saveStatus !== "idle"
            ? newGroupForm.saveStatus
            : newContactForm.saveStatus
        }
        saveError={newGroupForm.saveError ?? newContactForm.saveError}
        isDirty={newGroupForm.formState.isDirty || newContactForm.formState.isDirty}
        saveLabel="Save"
        onSave={() => {
          if (newGroupForm.formState.isDirty) void newGroupForm.handleSubmit(onCreateGroup)();
          if (newContactForm.formState.isDirty) void newContactForm.handleSubmit(onCreateContact)();
        }}
        onDiscard={() => {
          newGroupForm.reset({ name: "", type: "vso", equipmentPricingMode: "subsidized" });
          newContactForm.reset(emptyContactDefaults);
        }}
        onRetry={() => {
          if (newGroupForm.formState.isDirty) void newGroupForm.handleSubmit(onCreateGroup)();
          if (newContactForm.formState.isDirty) void newContactForm.handleSubmit(onCreateContact)();
        }}
      />
    </div>
  );
}

function EditGroupForm({
  groupId,
  initial,
  active,
  onArchive,
}: {
  groupId: Id<"invoiceGroups">;
  initial: InvoiceGroupFormValues;
  active: boolean;
  onArchive: () => void;
}) {
  const updateGroup = useMutation(api.invoiceGroups.update);

  const form = useConvexForm<InvoiceGroupFormValues>({
    schema: invoiceGroupSchema,
    defaultValues: initial,
    mode: "onChange",
  });

  const { formState, reset, runMutation } = form;
  const isDirty = formState.isDirty;

  useEffect(() => {
    if (formState.isDirty) return;
    reset(initial);
  }, [groupId, initial, reset, formState.isDirty]);

  const persist = useCallback(
    async (values: InvoiceGroupFormValues) => {
      await updateGroup({
        id: groupId,
        name: values.name.trim(),
        type: values.type,
        equipmentPricingMode: values.equipmentPricingMode,
      });
    },
    [groupId, updateGroup],
  );

  const onSave = useCallback(() => {
    void form.handleSubmit((values) =>
      runMutation(async () => {
        await persist(values);
        reset(values, { keepValues: true });
      }),
    )();
  }, [form, persist, reset, runMutation]);

  return (
    <>
      <Form {...form}>
        <div className="grid gap-3 md:grid-cols-4">
          <TextFormField name="name" label="Name" />
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.watch("type")}
              onChange={(e) => form.setValue("type", e.target.value as GroupType, { shouldDirty: true })}
            >
              {INVOICE_GROUP_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Equipment pricing</label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.watch("equipmentPricingMode")}
              onChange={(e) =>
                form.setValue("equipmentPricingMode", e.target.value as EquipmentPricingMode, {
                  shouldDirty: true,
                })
              }
            >
              {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Applied when this host is selected on a new invoice.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {active ? (
              <Button type="button" variant="outline" size="sm" onClick={onArchive}>
                Archive
              </Button>
            ) : null}
            <span className="flex items-center">
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
        </div>
      </Form>

      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={isDirty}
        onSave={onSave}
        onDiscard={() => reset(initial)}
        onRetry={onSave}
      />
    </>
  );
}

function ContactRow({
  contact,
  onArchive,
}: {
  contact: {
    _id: Id<"invoiceContacts">;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    active: boolean;
  };
  onArchive: () => void;
}) {
  const updateContact = useMutation(api.invoiceContacts.update);

  const form = useConvexForm<InvoiceContactFormValues>({
    schema: invoiceContactSchema,
    defaultValues: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    },
    mode: "onChange",
  });

  const { formState, reset } = form;
  const isDirty = formState.isDirty;

  useEffect(() => {
    if (formState.isDirty) return;
    reset({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
  }, [contact._id, contact.firstName, contact.lastName, contact.email, contact.phone, reset, formState.isDirty]);

  const persist = useCallback(
    async (values: InvoiceContactFormValues) => {
      await updateContact({
        id: contact._id,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone?.trim() || undefined,
      });
    },
    [contact._id, updateContact],
  );

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
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_160px]">
      <Form {...form}>
        <div className="contents md:col-span-4 md:grid md:grid-cols-4 md:gap-2">
          <TextFormField name="firstName" label="" placeholder="First name" />
          <TextFormField name="lastName" label="" placeholder="Last name" />
          <TextFormField name="email" label="" placeholder="Email" type="email" />
          <TextFormField name="phone" label="" placeholder="Phone" type="tel" />
        </div>
      </Form>
      <div className="flex flex-wrap items-center gap-2">
        {isDirty ? (
          <Button type="button" size="sm" disabled={form.saveStatus === "saving"} onClick={() => void form.handleSubmit(onSave)()}>
            Save
          </Button>
        ) : null}
        <span className="flex shrink-0">
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
        {contact.active ? (
          <Button type="button" size="sm" variant="outline" onClick={onArchive}>
            Archive
          </Button>
        ) : (
          <span className="self-center text-xs text-muted-foreground">Archived</span>
        )}
      </div>
    </div>
  );
}
