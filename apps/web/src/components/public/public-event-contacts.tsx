"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  ContactInputFields,
  InheritedContactRow,
  RemoveContactButton,
  type ContactFieldValues,
  type InheritedContactRowData,
} from "@/components/contacts/event-contact-ui";
import type { Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";

type Contact = {
  name: string;
  email?: string;
  phone?: string;
} | null;

/** Flattens the inherited contacts the public quote view exposes into display rows. */
export function buildInheritedContactRows(contacts: {
  venue: InheritedContactRowData | null;
  invoice: InheritedContactRowData | null;
  bands: InheritedContactRowData[];
}): InheritedContactRowData[] {
  return [
    ...(contacts.venue ? [contacts.venue] : []),
    ...(contacts.invoice ? [contacts.invoice] : []),
    ...contacts.bands,
  ];
}

type ManualContact = {
  _id: Id<"eventContacts">;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
};

type ContactInput = {
  name: string;
  position?: string;
  email?: string;
  phone?: string;
};

function ContactCard({ title, contact }: { title: string; contact: Contact }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <p className="font-medium">{title}</p>
      {contact ? (
        <div className="mt-1 space-y-1">
          <p>{contact.name}</p>
          {contact.email ? (
            <p>
              <a className="underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            </p>
          ) : null}
          {contact.phone ? (
            <p>
              <a className="underline" href={`tel:${contact.phone}`}>
                {contact.phone}
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground">Not assigned</p>
      )}
    </div>
  );
}

export function PublicEventContacts({
  manager,
  dayOfLead,
  inherited,
  manual,
  canEdit,
  onAdd,
  onDelete,
}: {
  manager: Contact;
  dayOfLead: Contact;
  inherited: InheritedContactRowData[];
  manual: ManualContact[];
  canEdit: boolean;
  onAdd?: (input: ContactInput) => Promise<void>;
  onDelete?: (contactId: Id<"eventContacts">) => Promise<void>;
}) {
  const [form, setForm] = useState<ContactFieldValues>({
    position: "",
    name: "",
    email: "",
    phone: "",
  });
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"eventContacts"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useAppDialog();

  const canManage = canEdit && Boolean(onAdd) && Boolean(onDelete);

  async function handleAdd() {
    if (!onAdd) return;
    const name = form.name.trim();
    if (!name) {
      setError("Enter a name for the contact.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await onAdd({
        name,
        position: form.position?.trim() || undefined,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
      });
      setForm({ position: "", name: "", email: "", phone: "" });
    } catch (addError) {
      setError(getConvexErrorMessage(addError, "Couldn’t add the contact."));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(contact: ManualContact) {
    if (!onDelete) return;
    const shouldDelete = await confirm({
      title: `Remove ${contact.name}?`,
      description: "This removes the contact from the event.",
      destructive: true,
      confirmLabel: "Remove contact",
    });
    if (!shouldDelete) return;
    setDeletingId(contact._id);
    setError(null);
    try {
      await onDelete(contact._id);
    } catch (deleteError) {
      setError(getConvexErrorMessage(deleteError, "Couldn’t remove the contact."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <ContactCard title="Event Manager" contact={manager} />
          <ContactCard title="Day-Of Lead" contact={dayOfLead} />
        </div>

        {inherited.length ? (
          <div className="divide-y rounded-md border">
            {inherited.map((row, index) => (
              <InheritedContactRow key={`${row.roleLabel}-${index}`} {...row} />
            ))}
          </div>
        ) : null}

        {manual.length ? (
          <div className="space-y-2">
            {manual.map((contact) => (
              <div
                key={contact._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                    {contact.position?.trim() || "Contact"}
                  </span>
                  <span className="font-medium">{contact.name}</span>
                  {contact.email || contact.phone ? (
                    <span className="text-muted-foreground">
                      {[contact.email, contact.phone].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
                {canManage ? (
                  <RemoveContactButton
                    label={`Remove ${contact.name}`}
                    disabled={deletingId === contact._id}
                    onClick={() => void handleDelete(contact)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {canManage ? (
          <div className="space-y-2 rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ContactInputFields
                value={form}
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={adding || !form.name.trim()}
              onClick={() => void handleAdd()}
            >
              {adding ? "Adding…" : "Add contact"}
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
