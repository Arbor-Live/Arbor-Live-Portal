"use client";

import { useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BORROW_AGREEMENT_TERMS, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function isBorrowAgreementComplete(accepted: ReadonlySet<string>, signedName: string) {
  return (
    BORROW_AGREEMENT_TERMS.every((term) => accepted.has(term.key)) && signedName.trim().length >= 2
  );
}

/**
 * Loan agreement step of the borrow request sheet: one checkbox per term,
 * then a typed-name e-signature. Everything must be ticked to submit.
 */
export function BorrowAgreementStep({
  accepted,
  onToggle,
  signedName,
  onSignedNameChange,
  signerEmail,
}: {
  accepted: ReadonlySet<string>;
  onToggle: (key: string, checked: boolean) => void;
  signedName: string;
  onSignedNameChange: (value: string) => void;
  signerEmail?: string;
}) {
  const acceptedCount = BORROW_AGREEMENT_TERMS.filter((term) => accepted.has(term.key)).length;
  const allAccepted = acceptedCount === BORROW_AGREEMENT_TERMS.length;
  const [today] = useState(() => formatDate(Date.now()));

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-md border border-status-amber-500/30 bg-status-amber-500/10 p-3 text-sm">
        <WarningIcon className="mt-0.5 size-4 shrink-0 text-status-amber-700" weight="fill" />
        <div className="space-y-1">
          <p className="font-medium text-status-amber-700">You&apos;re on your own with this gear</p>
          <p className="text-muted-foreground">
            Equipment loans come with no Arbor Live support. If this request is approved, you are
            responsible for the equipment and must cover any damage. If you&apos;re not sure how to
            use pro audio or lighting gear, ask us about easier on-campus options instead.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Confirm each term</p>
          <p
            className={cn(
              "text-xs tabular-nums",
              allAccepted ? "text-status-emerald-700" : "text-muted-foreground",
            )}
            data-testid="borrow-agreement-progress"
          >
            {acceptedCount} of {BORROW_AGREEMENT_TERMS.length} confirmed
          </p>
        </div>
        <ul className="space-y-2">
          {BORROW_AGREEMENT_TERMS.map((term) => {
            const checked = accepted.has(term.key);
            const id = `borrow-term-${term.key}`;
            return (
              <li key={term.key}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
                    checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(value) => onToggle(term.key, value === true)}
                  />
                  <span className="space-y-0.5 text-sm">
                    <span className="block font-medium">{term.title}</span>
                    <span className="block text-muted-foreground">{term.text}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <Label htmlFor="borrow-signed-name">Full legal name (e-signature)</Label>
        <Input
          id="borrow-signed-name"
          value={signedName}
          onChange={(event) => onSignedNameChange(event.target.value)}
          placeholder="Type your full legal name"
          autoComplete="name"
          disabled={!allAccepted}
        />
        <p className="text-xs text-muted-foreground">
          {allAccepted
            ? `By typing your name, you electronically sign this agreement${
                signerEmail ? ` as ${signerEmail}` : ""
              } on ${today}. It applies only if the request is approved.`
            : "Confirm every term above to sign."}
        </p>
      </div>
    </div>
  );
}
