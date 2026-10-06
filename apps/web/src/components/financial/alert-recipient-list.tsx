"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

/** Mirrors the backend validator: no commas, dot + letters-only TLD. */
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[A-Za-z]{2,}$/;

/** Editable email list for a settings-managed alert; external addresses allowed. */
export function AlertRecipientList({
  label,
  recipients,
  reservedEmails,
  onChange,
  disabled,
}: {
  label: string;
  recipients: string[];
  /** Emails already covered elsewhere; the picker refuses to add them. */
  reservedEmails?: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      notify.error(`"${email}" is not a valid email address.`);
      return;
    }
    if (reservedEmails?.includes(email)) {
      notify.error("That person already receives this notification.");
      return;
    }
    if (!recipients.includes(email)) onChange([...recipients, email]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one is notified.</p>
      ) : (
        recipients.map((email) => (
          <div
            key={email}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <span className="truncate text-sm">{email}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(recipients.filter((entry) => entry !== email))}
            >
              Remove
            </Button>
          </div>
        ))
      )}
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="name@example.com"
          aria-label={`Add email address to ${label}`}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
