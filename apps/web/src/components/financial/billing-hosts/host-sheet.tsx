"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { TextFormField } from "@/components/forms/text-form-field";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  RowMenu,
  SheetSection,
} from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useConvexForm } from "@/hooks/use-convex-form";
import { api, type Id } from "@/lib/convex-api";
import { formatRelativeTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { EQUIPMENT_PRICING_MODE_LABELS, INVOICE_GROUP_TYPE_LABELS } from "@/lib/invoice-group-labels";
import { cn } from "@/lib/utils";
import {
  invoiceContactSchema,
  invoiceGroupSchema,
  type InvoiceContactFormValues,
  type InvoiceGroupFormValues,
} from "@/lib/validations/financial";
import { HostFields } from "./host-fields";
import {
  ALIAS_SOURCE_LABELS,
  attempt,
  contactName,
  HOST_STATUS,
  hostStatus,
  type HostContact,
  type HostRow,
} from "./host-model";

const EMPTY_CONTACT: InvoiceContactFormValues = { firstName: "", lastName: "", email: "", phone: "" };

/** Reports whether one of the panel's forms holds unsaved input, keyed by form. */
type MarkDirty = (form: string, dirty: boolean) => void;

function useReportDirty(markDirty: MarkDirty, form: string, dirty: boolean) {
  useEffect(() => {
    markDirty(form, dirty);
    return () => markDirty(form, false);
  }, [dirty, form, markDirty]);
}

/** The host editor: details, contacts and aliases. Edits save straight through their mutation. */
export function HostSheet({
  host,
  onOpenChange,
  onArchive,
  onRestore,
  onMerge,
}: {
  host: HostRow | null;
  onOpenChange: (open: boolean) => void;
  onArchive: (host: HostRow) => void;
  onRestore: (host: HostRow) => void;
  onMerge: (host: HostRow) => void;
}) {
  const { confirm } = useAppDialog();
  const dirtyForms = useRef(new Set<string>());
  const markDirty = useCallback<MarkDirty>((form, dirty) => {
    if (dirty) dirtyForms.current.add(form);
    else dirtyForms.current.delete(form);
  }, []);

  async function requestClose() {
    if (host && dirtyForms.current.size > 0) {
      const discard = await confirm({
        title: `Discard your changes to ${host.name}?`,
        description: "What you've typed in the panel will be lost. The saved host stays as it was.",
        destructive: true,
        confirmLabel: "Discard changes",
      });
      if (!discard) return;
    }
    onOpenChange(false);
  }

  return (
    <DetailSheet
      open={host !== null}
      onOpenChange={(open) => {
        if (open) onOpenChange(true);
        else void requestClose();
      }}
      testId="host-sheet"
      // Focusing the name field on open selects it, and one stray key would rename the host.
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      {host ? (
        <HostSheetBody
          key={host._id}
          host={host}
          markDirty={markDirty}
          onArchive={() => onArchive(host)}
          onRestore={() => onRestore(host)}
          onMerge={() => onMerge(host)}
        />
      ) : null}
    </DetailSheet>
  );
}

function HostSheetBody({
  host,
  markDirty,
  onArchive,
  onRestore,
  onMerge,
}: {
  host: HostRow;
  markDirty: MarkDirty;
  onArchive: () => void;
  onRestore: () => void;
  onMerge: () => void;
}) {
  const status = HOST_STATUS[hostStatus(host)];
  return (
    <div className="flex min-h-full flex-col">
      <DetailSheetHeader
        title={host.name}
        pill={
          <StatusPill tone={status.tone} className="h-6">
            {status.label}
          </StatusPill>
        }
        description={[
          INVOICE_GROUP_TYPE_LABELS[host.type],
          `${EQUIPMENT_PRICING_MODE_LABELS[host.equipmentPricingMode]} equipment pricing`,
          host.lastUsedAt ? `Last billed ${formatRelativeTime(host.lastUsedAt)}` : "Never billed",
        ].join(" · ")}
      />
      <HostDetailsSection host={host} markDirty={markDirty} />
      <ContactsSection groupId={host._id} markDirty={markDirty} />
      <AliasesSection groupId={host._id} markDirty={markDirty} />
      <DetailSheetFooter
        start={
          host.active ? (
            <Button type="button" variant="outline" size="sm" onClick={onArchive}>
              Archive host
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onRestore}>
              Restore host
            </Button>
          )
        }
      >
        {host.active ? (
          <Button type="button" variant="outline" size="sm" onClick={onMerge}>
            Merge hosts into this one
          </Button>
        ) : null}
      </DetailSheetFooter>
    </div>
  );
}

function HostDetailsSection({ host, markDirty }: { host: HostRow; markDirty: MarkDirty }) {
  const updateGroup = useMutation(api.invoiceGroups.update);
  const initial = useMemo<InvoiceGroupFormValues>(
    () => ({ name: host.name, type: host.type, equipmentPricingMode: host.equipmentPricingMode }),
    [host.name, host.type, host.equipmentPricingMode],
  );
  const form = useConvexForm<InvoiceGroupFormValues>({
    schema: invoiceGroupSchema,
    defaultValues: initial,
    mode: "onTouched",
  });
  const { isDirty } = form.formState;
  const { reset } = form;
  useReportDirty(markDirty, "details", isDirty);

  // Pick up edits made elsewhere, unless there's a draft here.
  useEffect(() => {
    if (!isDirty) reset(initial);
  }, [initial, isDirty, reset]);

  const onSubmit = form.submitMutation(
    async (values) => {
      await updateGroup({
        id: host._id,
        name: values.name.trim(),
        type: values.type,
        equipmentPricingMode: values.equipmentPricingMode,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        reset(values);
        notify.success(`Saved ${values.name.trim()}`);
      },
    },
  );

  return (
    <SheetSection title="Details">
      <Form {...form}>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)} data-testid="host-details-form">
          <HostFields form={form} idPrefix="edit-host" />
          {form.saveError ? <p className="text-sm text-destructive">{form.saveError}</p> : null}
          {isDirty ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  reset(initial);
                  form.resetSaveState();
                }}
              >
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={form.saveStatus === "saving"}>
                {form.saveStatus === "saving" ? "Saving…" : "Save details"}
              </Button>
            </div>
          ) : null}
        </form>
      </Form>
    </SheetSection>
  );
}

function ContactsSection({ groupId, markDirty }: { groupId: Id<"invoiceGroups">; markDirty: MarkDirty }) {
  const { confirm } = useAppDialog();
  const contacts = useQuery(api.invoiceContacts.listForAdmin, { groupId, includeInactive: true });
  const updateContact = useMutation(api.invoiceContacts.update);
  const archiveContact = useMutation(api.invoiceContacts.archive);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"invoiceContacts"> | null>(null);

  const rows = useMemo(
    () => [...(contacts ?? [])].sort((a, b) => Number(b.active) - Number(a.active)),
    [contacts],
  );

  async function archive(contact: HostContact) {
    const name = contactName(contact);
    const ok = await confirm({
      title: `Archive ${name}?`,
      description: "They drop out of the contact picker on new invoices. Invoices already billed to them keep their name.",
      destructive: true,
      confirmLabel: "Archive contact",
    });
    if (ok) await attempt(() => archiveContact({ id: contact._id }), `Archived ${name}`);
  }

  return (
    <SheetSection
      title="Contacts"
      action={
        adding ? null : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon />
            Add contact
          </Button>
        )
      }
    >
      {adding ? (
        <ContactForm groupId={groupId} markDirty={markDirty} onDone={() => setAdding(false)} />
      ) : null}
      {contacts === undefined ? (
        <p className="text-sm text-muted-foreground">Loading contacts…</p>
      ) : rows.length === 0 ? (
        adding ? null : (
          <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No contacts yet. Add the person who receives this host&apos;s quotes and invoices.
          </p>
        )
      ) : (
        <ul className="divide-y border" data-testid="host-contact-list">
          {rows.map((contact) =>
            editingId === contact._id ? (
              <li key={contact._id} className="p-3">
                <ContactForm
                  groupId={groupId}
                  contact={contact}
                  markDirty={markDirty}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={contact._id}
                className={cn("flex items-center gap-2 py-2 pr-1 pl-3 text-sm", !contact.active && "text-muted-foreground")}
                data-testid={`host-contact-${contact._id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{contactName(contact)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[contact.email, contact.phone].filter(Boolean).join(" · ") || "No email or phone"}
                  </p>
                </div>
                {contact.active ? null : <span className="shrink-0 text-xs">Archived</span>}
                <RowMenu label={`More for ${contactName(contact)}`}>
                  <DropdownMenuItem onSelect={() => setEditingId(contact._id)}>Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {contact.active ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => void archive(contact)}>
                      Archive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() =>
                        void attempt(
                          () => updateContact({ id: contact._id, active: true }),
                          `Restored ${contactName(contact)}`,
                        )
                      }
                    >
                      Restore
                    </DropdownMenuItem>
                  )}
                </RowMenu>
              </li>
            ),
          )}
        </ul>
      )}
    </SheetSection>
  );
}

/** Adds a contact to the host, or edits `contact` when given. */
function ContactForm({
  groupId,
  contact,
  markDirty,
  onDone,
}: {
  groupId: Id<"invoiceGroups">;
  contact?: HostContact;
  markDirty: MarkDirty;
  onDone: () => void;
}) {
  const createContact = useMutation(api.invoiceContacts.create);
  const updateContact = useMutation(api.invoiceContacts.update);
  const form = useConvexForm<InvoiceContactFormValues>({
    schema: invoiceContactSchema,
    defaultValues: contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
        }
      : EMPTY_CONTACT,
    mode: "onTouched",
  });
  useReportDirty(markDirty, contact ? `contact-${contact._id}` : "contact-new", form.formState.isDirty);

  const onSubmit = form.submitMutation(
    async (values) => {
      const fields = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        phone: values.phone?.trim() ?? "",
      };
      // Sent as "" rather than dropped, so clearing a field on edit clears it.
      if (contact) await updateContact({ id: contact._id, ...fields });
      else await createContact({ groupId, ...fields, active: true });
      return contactName(fields);
    },
    {
      onSuccess: (name) => {
        notify.success(contact ? `Saved ${name}` : `Added ${name}`);
        onDone();
      },
    },
  );

  return (
    <Form {...form}>
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit(onSubmit)}
        data-testid={contact ? "host-contact-edit-form" : "host-contact-new-form"}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextFormField name="firstName" label="First name" autoFocus />
          <TextFormField name="lastName" label="Last name" />
          <TextFormField name="email" label="Email" type="email" />
          <TextFormField name="phone" label="Phone" type="tel" />
        </div>
        {form.saveError ? <p className="text-sm text-destructive">{form.saveError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={form.saveStatus === "saving"}>
            {contact ? "Save contact" : "Add contact"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function AliasesSection({ groupId, markDirty }: { groupId: Id<"invoiceGroups">; markDirty: MarkDirty }) {
  const aliases = useQuery(api.invoiceGroups.listAliases, { groupId });
  const addAlias = useMutation(api.invoiceGroups.addAlias);
  const removeAlias = useMutation(api.invoiceGroups.removeAlias);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  useReportDirty(markDirty, "alias", draft.trim() !== "");

  async function add() {
    const alias = draft.trim();
    if (!alias) return;
    setBusy(true);
    if (await attempt(() => addAlias({ groupId, alias }), `Added alias ${alias}`)) setDraft("");
    setBusy(false);
  }

  return (
    <SheetSection title="Aliases">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="New alias"
          placeholder="Another name for this host, like an acronym"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          data-testid="host-alias-input"
        />
        <Button type="submit" variant="outline" disabled={busy || !draft.trim()}>
          Add alias
        </Button>
      </form>
      {aliases === undefined ? (
        <p className="text-sm text-muted-foreground">Loading aliases…</p>
      ) : aliases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No aliases.</p>
      ) : (
        <ul className="divide-y border" data-testid="host-alias-list">
          {aliases.map((alias) => (
            <li key={alias._id} className="flex items-center gap-2 py-1.5 pr-1 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{alias.alias}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ALIAS_SOURCE_LABELS[alias.source]}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove alias ${alias.alias}`}
                onClick={() => void attempt(() => removeAlias({ aliasId: alias._id }), `Removed alias ${alias.alias}`)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SheetSection>
  );
}
