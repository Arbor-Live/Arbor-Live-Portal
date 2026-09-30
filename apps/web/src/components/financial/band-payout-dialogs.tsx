"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { EventBandPaymentForm } from "@/components/events/lineup/lineup-forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate, formatUsd } from "@/lib/format";
import type { PayoutRow } from "@/lib/band-payout-stages";

function PayoutList({ rows }: { rows: PayoutRow[] }) {
  return (
    <ul className="max-h-48 divide-y overflow-y-auto border text-sm">
      {rows.map((row) => (
        <li key={row._id} className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{row.bandName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(row.eventStartAt)} · {row.eventTitle}
            </p>
          </div>
          <span className="shrink-0 tabular-nums">{formatUsd(row.totalUsd)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Send (or resend) signature requests. One payout shows the email it will
 * send; several list who gets one (each payee gets their own email).
 */
export function SendSignatureRequestDialog({
  rows,
  onOpenChange,
  onSend,
}: {
  rows: PayoutRow[] | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves true once sent; the dialog stays open on failure. */
  onSend: (paymentIds: Id<"eventBandPayments">[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={rows !== null && rows.length > 0} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="payout-send-dialog">
        {rows && rows.length > 0 ? (
          <SendSignatureRequestBody
            key={rows.map((row) => row._id).join()}
            rows={rows}
            onCancel={() => onOpenChange(false)}
            onSend={onSend}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SendSignatureRequestBody({
  rows,
  onCancel,
  onSend,
}: {
  rows: PayoutRow[];
  onCancel: () => void;
  onSend: (paymentIds: Id<"eventBandPayments">[]) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const single = rows.length === 1 ? rows[0] : null;
  const preview = useQuery(
    api.bandPayments.buildConfirmationPreview,
    single ? { paymentId: single._id } : "skip",
  );
  const resend = single?.status === "awaiting_confirmation";
  const blocked = rows.filter((row) => !row.payeeComplete);
  const sendLabel = resend
    ? "Resend signature request"
    : rows.length === 1
      ? "Send signature request"
      : `Send ${rows.length} signature requests`;

  async function send() {
    setBusy(true);
    try {
      await onSend(rows.map((row) => row._id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {single
            ? `${resend ? "Resend" : "Send"} ${single.bandName}'s signature request?`
            : `Send ${rows.length} signature requests?`}
        </DialogTitle>
        <DialogDescription>
          {single
            ? `The designated payee (${single.designatedPayeeName ?? "not set"}) gets this email with a link to review and sign the ${formatUsd(single.totalUsd)} payout.`
            : "Each designated payee gets their own email with a link to review and sign their payout."}
        </DialogDescription>
      </DialogHeader>

      {single ? (
        preview ? (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Subject</p>
              <p className="border bg-muted/20 px-3 py-2">{preview.subject}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Body</p>
              <pre className="max-h-80 overflow-auto border bg-muted/20 px-3 py-2 font-sans whitespace-pre-wrap">
                {preview.body}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        )
      ) : (
        <PayoutList rows={rows} />
      )}

      {blocked.length > 0 ? (
        <p className="text-sm text-destructive">
          Payee info is incomplete for {blocked.map((row) => row.bandName).join(", ")}. Ask the artist to
          finish their payee details first.
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || blocked.length > 0}
          onClick={() => void send()}
        >
          {busy ? "Sending…" : sendLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Edit a payout's pricing without leaving the queue. Reuses the Lineup's
 * payout form, which owns the validation and the upsert.
 */
export function EditPayoutDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: PayoutRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="payout-edit-dialog">
        {row ? (
          <>
            <DialogHeader>
              <DialogTitle>Edit {row.bandName}&apos;s payout</DialogTitle>
              <DialogDescription>
                {formatDate(row.eventStartAt)} · {row.eventTitle}
              </DialogDescription>
            </DialogHeader>
            <EventBandPaymentForm
              embedded
              showStatus={false}
              showPayee={false}
              eventId={row.eventId}
              organizationId={row.organizationId}
              payment={row}
              organizationLocked
              excludedOrganizationIds={[]}
              onSaved={onSaved}
              onCancel={() => onOpenChange(false)}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type MarkPaidEntry = {
  paymentId: Id<"eventBandPayments">;
  servicePaymentNumber: string;
};

/**
 * Record GrantEd transfers. Several payouts take one transfer / Service
 * Payment number for all of them, or one per payout.
 */
export function MarkPaidDialog({
  rows,
  onOpenChange,
  onConfirm,
}: {
  rows: PayoutRow[] | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves true once recorded; the dialog stays open on failure. */
  onConfirm: (entries: MarkPaidEntry[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={rows !== null && rows.length > 0} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="payout-mark-paid-dialog">
        {rows && rows.length > 0 ? (
          <MarkPaidBody
            key={rows.map((row) => row._id).join()}
            rows={rows}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidBody({
  rows,
  onCancel,
  onConfirm,
}: {
  rows: PayoutRow[];
  onCancel: () => void;
  onConfirm: (entries: MarkPaidEntry[]) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"shared" | "each">("shared");
  const [shared, setShared] = useState("");
  const [perRow, setPerRow] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const single = rows.length === 1 ? rows[0] : null;
  const total = rows.reduce((sum, row) => sum + row.totalUsd, 0);

  const entries: MarkPaidEntry[] = rows.map((row) => ({
    paymentId: row._id,
    servicePaymentNumber: (mode === "shared" ? shared : (perRow[row._id] ?? "")).trim(),
  }));
  const ready = entries.every((entry) => entry.servicePaymentNumber.length > 0);

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    try {
      await onConfirm(entries);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {single ? `Mark ${single.bandName}'s payout paid` : `Mark ${rows.length} payouts paid`}
        </DialogTitle>
        <DialogDescription>
          Enter the GrantEd transfer / Service Payment number after submitting evidence
          {single ? "" : ` (${formatUsd(total)} in total)`}. Each artist is told Stanford is processing
          their payment.
        </DialogDescription>
      </DialogHeader>

      {single ? null : (
        <>
          <PayoutList rows={rows} />
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(value) => {
              if (value === "shared" || value === "each") setMode(value);
            }}
            aria-label="Transfer numbers"
          >
            <ToggleGroupItem value="shared">One number for all</ToggleGroupItem>
            <ToggleGroupItem value="each">One per payout</ToggleGroupItem>
          </ToggleGroup>
        </>
      )}

      {mode === "shared" || single ? (
        <div className="space-y-1">
          <Label htmlFor="mark-paid-number">Transfer / Service Payment number</Label>
          <Input
            id="mark-paid-number"
            value={shared}
            onChange={(event) => setShared(event.target.value)}
            placeholder="SP-2026-0042"
            autoFocus
          />
        </div>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {rows.map((row, index) => (
            <div key={row._id} className="space-y-1">
              <Label htmlFor={`mark-paid-number-${row._id}`}>
                {row.bandName} · {formatUsd(row.totalUsd)}
              </Label>
              <Input
                id={`mark-paid-number-${row._id}`}
                value={perRow[row._id] ?? ""}
                onChange={(event) => setPerRow((prev) => ({ ...prev, [row._id]: event.target.value }))}
                placeholder="SP-2026-0042"
                autoFocus={index === 0}
              />
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !ready}>
          {busy ? "Saving…" : single ? "Mark paid" : `Mark ${rows.length} paid`}
        </Button>
      </DialogFooter>
    </form>
  );
}
