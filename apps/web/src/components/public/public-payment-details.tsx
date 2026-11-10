"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { ARBOR_PAYMENT_DETAILS } from "@arbor/invoice-document/payment-details";

function CopyableValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the value is still selectable on screen.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono font-medium tabular-nums">{value}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      </dd>
    </div>
  );
}

/** Where to send money: the same details that are printed on the invoice. */
export function PublicPaymentDetails() {
  const details = ARBOR_PAYMENT_DETAILS;
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="public-payment-details">
      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <p className="font-medium">
          <a
            href={details.assuEpayUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-primary"
          >
            ASSU ePay
          </a>{" "}
          or GrantEd Group Transfer
        </p>
        <dl className="space-y-1">
          <CopyableValue label="VSO" value={`${details.vsoName} (${details.vsoNumber})`} />
        </dl>
      </div>
      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <p className="font-medium">iJournal</p>
        <dl className="space-y-1">
          <CopyableValue label="PTA" value={details.ijournalPta} />
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Approver</dt>
            <dd className="font-medium">{details.ijournalApprover}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
