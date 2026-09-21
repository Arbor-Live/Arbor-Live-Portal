"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shared building blocks for event contact cards (staff editor + public portals). */

export type InheritedContactRowData = {
  roleLabel: string;
  person: string;
  contact?: string;
  notes?: string;
};

export type ContactFieldValues = {
  position: string;
  name: string;
  email: string;
  phone: string;
};

/**
 * Read-only row for venue / host / band contacts. Label-first so the manual
 * rows below it line up on the same columns.
 */
export function InheritedContactRow({ roleLabel, person, contact, notes }: InheritedContactRowData) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {roleLabel}
      </span>
      <span className="font-medium">{person}</span>
      {contact ? <span className="text-muted-foreground">{contact}</span> : null}
      {notes ? <span className="text-xs text-muted-foreground">{notes}</span> : null}
    </div>
  );
}

/**
 * The four contact inputs, ordered Position → Name → Email → Phone so they match
 * the read-only rows above. Used by the staff draft rows and the public add form.
 */
export function ContactInputFields({
  value,
  onChange,
  disabled,
}: {
  value: ContactFieldValues;
  onChange: (patch: Partial<ContactFieldValues>) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Input
        aria-label="Position"
        placeholder="Position"
        value={value.position}
        disabled={disabled}
        onChange={(event) => onChange({ position: event.target.value })}
      />
      <Input
        aria-label="Name"
        placeholder="Name"
        value={value.name}
        disabled={disabled}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <Input
        aria-label="Email"
        placeholder="Email"
        type="email"
        value={value.email}
        disabled={disabled}
        onChange={(event) => onChange({ email: event.target.value })}
      />
      <Input
        aria-label="Phone"
        placeholder="Phone"
        value={value.phone}
        disabled={disabled}
        onChange={(event) => onChange({ phone: event.target.value })}
      />
    </>
  );
}

export function RemoveContactButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <TrashIcon className="size-4" />
    </Button>
  );
}
