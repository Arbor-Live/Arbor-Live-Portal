"use client";

import { useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";

type Contact = {
  name: string;
  email?: string;
  phone?: string;
} | null;

/** Inherited venue / host billing / band contact, shown read-only. */
type ContactRow = {
  roleLabel: string;
  person: string;
  contact?: string;
  notes?: string;
};

/** Flattens the inherited contacts the public quote view exposes into display rows. */
export function buildInheritedContactRows(contacts: {
  venue: ContactRow | null;
  invoice: ContactRow | null;
  bands: ContactRow[];
}): ContactRow[] {
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

function InheritedRow({ row }: { row: ContactRow }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {row.roleLabel}
      </span>
      <span className="font-medium">{row.person}</span>
      {row.contact ? <span className="text-muted-foreground">{row.contact}</span> : null}
      {row.notes ? <span className="text-xs text-muted-foreground">{row.notes}</span> : null}
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
  inherited: ContactRow[];
  manual: ManualContact[];
  canEdit: boolean;
  onAdd?: (input: ContactInput) => Promise<void>;
  onDelete?: (contactId: Id<"eventContacts">) => Promise<void>;
}) {
  const [form, setForm] = useState<ContactInput>({
    name: "",
    position: "",
    email: "",
    phone: "",
  });
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"eventContacts"> | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setForm({ name: "", position: "", email: "", phone: "" });
    } catch (addError) {
      setError(getConvexErrorMessage(addError, "Couldn’t add the contact."));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(contactId: Id<"eventContacts">) {
    if (!onDelete) return;
    setDeletingId(contactId);
    setError(null);
    try {
      await onDelete(contactId);
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
              <InheritedRow key={`${row.roleLabel}-${index}`} row={row} />
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${contact.name}`}
                    disabled={deletingId === contact._id}
                    onClick={() => void handleDelete(contact._id)}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {canManage ? (
          <div className="space-y-2 rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                aria-label="Name"
                placeholder="Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                aria-label="Position"
                placeholder="Position"
                value={form.position}
                onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))}
              />
              <Input
                aria-label="Email"
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <Input
                aria-label="Phone"
                placeholder="Phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
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
