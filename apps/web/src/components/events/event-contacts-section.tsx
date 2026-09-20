"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContactInputFields,
  InheritedContactRow,
  RemoveContactButton,
  type InheritedContactRowData,
} from "@/components/contacts/event-contact-ui";
import { FormSaveBar } from "@/components/forms";
import { getConvexErrorMessage } from "@/lib/convex-error";
import type { SaveStatus } from "@/hooks/use-convex-form";

type ContactDraft = {
  key: string;
  id?: Id<"eventContacts">;
  name: string;
  position: string;
  email: string;
  phone: string;
};

type InheritedRow = InheritedContactRowData & { key: string };

let draftCounter = 0;

function newDraft(): ContactDraft {
  draftCounter += 1;
  return { key: `draft-${draftCounter}`, name: "", position: "", email: "", phone: "" };
}

function toDraft(row: {
  _id: Id<"eventContacts">;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
}): ContactDraft {
  return {
    key: row._id,
    id: row._id,
    name: row.name,
    position: row.position ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
  };
}

function signatureOf(drafts: ContactDraft[]): string {
  return JSON.stringify(
    drafts.map((draft) => ({
      id: draft.id,
      name: draft.name,
      position: draft.position,
      email: draft.email,
      phone: draft.phone,
    })),
  );
}

function joinContact(email?: string, phone?: string): string | undefined {
  const value = [email, phone]
    .filter((entry): entry is string => Boolean(entry?.trim()))
    .join(" · ");
  return value || undefined;
}

export function EventContactsSection({
  eventId,
  canEdit,
}: {
  eventId: Id<"events">;
  canEdit: boolean;
}) {
  const board = useQuery(api.eventContacts.getBoard, { eventId });
  // Shared with the riders section below, so rider documents load once.
  const bandRows = useQuery(api.bandRiders.listForEvent, { eventId });
  const upsertContacts = useMutation(api.eventContacts.upsertForEvent);

  const [drafts, setDrafts] = useState<ContactDraft[]>([]);
  const [savedSignature, setSavedSignature] = useState("[]");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty = signatureOf(drafts) !== savedSignature;

  const serverSignature = board ? signatureOf(board.manual.map(toDraft)) : null;
  const lastServerSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (board === undefined || serverSignature === null) return;
    if (lastServerSignatureRef.current === serverSignature) return;
    lastServerSignatureRef.current = serverSignature;
    const next = board.manual.map(toDraft);
    setDrafts(next);
    setSavedSignature(signatureOf(next));
  }, [board, serverSignature]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const inherited = useMemo<InheritedRow[]>(() => {
    const rows: InheritedRow[] = [];
    if (board?.venue) rows.push({ key: "venue", ...board.venue });
    if (board?.invoice) rows.push({ key: "invoice", ...board.invoice });
    for (const [index, row] of (bandRows ?? []).entries()) {
      const rider = row.rider;
      if (!rider) continue;
      const name = rider.contactName?.trim();
      const contact = joinContact(rider.contactEmail, rider.contactPhone);
      if (!name && !contact) continue;
      rows.push({
        key: `band-${index}`,
        roleLabel: "Band contact",
        person: name || row.bandName,
        contact,
        notes: row.bandName,
      });
    }
    return rows;
  }, [board, bandRows]);

  function updateDraft(key: string, patch: Partial<ContactDraft>) {
    setDrafts((prev) =>
      prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((draft) => draft.key !== key));
  }

  async function handleSave() {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const saved = await upsertContacts({
        eventId,
        contacts: drafts
          .filter((draft) => draft.name.trim())
          .map((draft) => ({
            id: draft.id,
            name: draft.name,
            position: draft.position || undefined,
            email: draft.email || undefined,
            phone: draft.phone || undefined,
          })),
      });
      const next = saved.map(toDraft);
      setDrafts(next);
      setSavedSignature(signatureOf(next));
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setSaveError(getConvexErrorMessage(error, "Couldn’t save contacts."));
    }
  }

  return (
    <Card data-testid="event-contacts">
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {inherited.length ? (
          <div className="divide-y rounded-md border" data-testid="event-contacts-inherited">
            {inherited.map(({ key, ...row }) => (
              <InheritedContactRow key={key} {...row} />
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {drafts.map((draft) => (
            <div
              key={draft.key}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
            >
              <ContactInputFields
                value={draft}
                onChange={(patch) => updateDraft(draft.key, patch)}
                disabled={!canEdit}
              />
              <RemoveContactButton
                label="Remove contact"
                disabled={!canEdit}
                onClick={() => removeDraft(draft.key)}
              />
            </div>
          ))}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrafts((prev) => [...prev, newDraft()])}
            >
              <PlusIcon className="size-4" /> Add contact
            </Button>
          ) : null}
        </div>
      </CardContent>

      {canEdit ? (
        <FormSaveBar
          tier="C"
          saveStatus={saveStatus}
          saveError={saveError}
          isDirty={isDirty}
          saveLabel="Save contacts"
          onSave={() => void handleSave()}
          onDiscard={() => {
            const next = (board?.manual ?? []).map(toDraft);
            setDrafts(next);
            setSavedSignature(signatureOf(next));
            setSaveStatus("idle");
            setSaveError(null);
          }}
          onRetry={() => void handleSave()}
        />
      ) : null}
    </Card>
  );
}
