"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Editable email list for a settings-managed alert; external addresses allowed. */
export function AlertRecipientList({
  label,
  recipients,
  onChange,
  disabled,
}: {
  label: string;
  recipients: string[];
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
        <input
          type="email"
          placeholder="name@example.com"
          className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
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
