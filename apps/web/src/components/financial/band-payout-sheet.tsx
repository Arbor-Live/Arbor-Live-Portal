"use client";

import { SheetSection, SheetField } from "@/components/list-page";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowSquareOutIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { BandPaymentAgreementPdfButton } from "@/components/financial/band-payment-agreement-pdf-button";
import { EditPayoutDialog } from "@/components/financial/band-payout-dialogs";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";
import { grantedFilingFields } from "@/lib/granted-filing";
import { compressImageToLimit } from "@/lib/image-processing";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  PAYOUT_STAGE_WHO,
  payoutAgeLabel,
  payoutLineupHref,
  payoutPrimaryAction,
  payoutStageTone,
  payoutStatusLabel,
  type PayoutRow,
} from "@/lib/band-payout-stages";
import { formatDate, formatDateTime, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type PayoutSheetHandlers = {
  /** Runs the row's primary action (a dialog may take over). */
  runPrimary: (row: PayoutRow) => Promise<unknown>;
  /** Resolves true once the payout is removed; false if cancelled or it failed. */
  remove: (row: PayoutRow) => Promise<boolean>;
  /** Brings back a removed payout; resolves whether it worked. */
  restore: (row: PayoutRow) => Promise<boolean>;
};

/** Details for one payout: payee, amounts, activity, and links back to the Lineup. */
export function PayoutSheet({
  row,
  onOpenChange,
  handlers,
}: {
  row: PayoutRow | null;
  onOpenChange: (open: boolean) => void;
  handlers: PayoutSheetHandlers;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="payout-sheet">
        {row ? (
          // Keyed so local state resets when another payout opens.
          <PayoutSheetBody
            key={row._id}
            row={row}
            handlers={handlers}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function pricingSummary(row: PayoutRow) {
  if (row.pricingMode !== "per_member_hourly") return "Fixed total";
  const parts = [
    row.memberCount != null ? `${row.memberCount} member${row.memberCount === 1 ? "" : "s"}` : null,
    row.performanceHours != null ? `${row.performanceHours} hr` : null,
    row.ratePerMemberPerHourUsd != null ? `${formatUsd(row.ratePerMemberPerHourUsd)}/member/hr` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" × ") : "Per member, hourly";
}

type Step = { label: string; at?: number; detail?: string };

function activitySteps(row: PayoutRow): Step[] {
  const queued = row.status !== "draft" ? (row.promotedAt ?? Math.max(row.eventEndAt, row.createdAt)) : undefined;
  return [
    { label: "Created", at: row.createdAt },
    { label: "Joined the queue after the event", at: queued },
    {
      label: "Signature request sent",
      at: row.confirmationEmailSentAt,
      detail: row.confirmationSentByName,
    },
    {
      label: row.emailConfirmationUrl ? "Confirmed by email" : "Signed",
      at: row.confirmedAt,
      detail:
        row.signatureTypedName ??
        row.confirmationReplyFrom ??
        (row.emailConfirmedByName ? `Screenshot attached by ${row.emailConfirmedByName}` : undefined),
    },
    {
      label: "Paid",
      at: row.paidAt,
      detail: [row.paidByName, row.servicePaymentNumber ? `#${row.servicePaymentNumber}` : null]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

function PayoutSheetBody({
  row,
  handlers,
  onClose,
}: {
  row: PayoutRow;
  handlers: PayoutSheetHandlers;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const primary = payoutPrimaryAction(row.status);
  const stage = row.stage ?? "upcoming";
  const steps = activitySteps(row);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {row.bandName}
          <StatusPill tone={payoutStageTone(stage)} className="h-6">
            {payoutStatusLabel(row.status)}
          </StatusPill>
        </SheetTitle>
        <SheetDescription>
          {formatDate(row.eventStartAt)} · {row.eventTitle}
          {row.venueName ? ` · ${row.venueName}` : ""}
        </SheetDescription>
        <p className="text-sm">
          {row.status === "cancelled" ? "Removed from the pipeline" : PAYOUT_STAGE_WHO[stage]}
          <span className="text-muted-foreground"> · {payoutAgeLabel(row, nowMs)}</span>
        </p>
      </SheetHeader>

      {row.status === "pending_onboarding" && row.onboardingIncompleteSteps.length > 0 ? (
        <SheetSection title="Onboarding left">
          <ul className="space-y-1 text-sm">
            {row.onboardingIncompleteSteps.map((step) => (
              <li key={step.id}>{step.label}</li>
            ))}
          </ul>
        </SheetSection>
      ) : null}

      <SheetSection title="Payout">
        <dl className="space-y-2">
          <SheetField label="Amount">
            <span className="font-medium tabular-nums">{formatUsd(row.totalUsd)}</span>
          </SheetField>
          <SheetField label="Pricing">{pricingSummary(row)}</SheetField>
          <SheetField label="Payment ID">
            <span className="tabular-nums">{row.confirmationToken}</span>
          </SheetField>
          {row.emailConfirmationUrl ? (
            <SheetField label="Confirmation">
              <a
                className="underline-offset-4 hover:underline"
                href={row.emailConfirmationUrl}
                target="_blank"
                rel="noreferrer"
              >
                Email screenshot
              </a>
            </SheetField>
          ) : null}
          {row.status === "paid" ? (
            <TransferNumberField row={row} />
          ) : row.servicePaymentNumber ? (
            <SheetField label="Transfer #">
              <span className="tabular-nums">{row.servicePaymentNumber}</span>
            </SheetField>
          ) : null}
        </dl>
        {row.canDownloadAgreementPdf || row.status !== "paid" ? (
          <div className="flex flex-wrap gap-2">
            {row.canDownloadAgreementPdf ? (
              <BandPaymentAgreementPdfButton paymentId={row._id} label="Agreement PDF" />
            ) : null}
            {row.status !== "paid" && row.status !== "cancelled" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit payout
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetSection>

      {row.status === "pending_email" || row.status === "awaiting_confirmation" ? (
        <EmailConfirmationSection row={row} />
      ) : null}

      {row.status === "confirmed" ? <GrantedFilingSection row={row} /> : null}

      <SheetSection title="Payee">
        {!row.payeeComplete ? (
          <p className="rounded-md bg-status-amber-500/15 px-2 py-1 text-xs text-status-amber-800 dark:text-status-amber-200">
            Payee info is incomplete, so the signature request can&apos;t go out yet.
          </p>
        ) : null}
        <dl className="space-y-2">
          <SheetField label="Name">{row.designatedPayeeName ?? "Not set"}</SheetField>
          <SheetField label="Email">{row.designatedPayeeEmail ?? "Not set"}</SheetField>
          <SheetField label="Mailing address">
            <span className="whitespace-pre-wrap">{row.designatedPayeeMailingAddress?.trim() || "Not set"}</span>
          </SheetField>
          <SheetField label="Method">{formatBandPayeePayoutMethod(row.designatedPayeePayoutMethod)}</SheetField>
        </dl>
      </SheetSection>

      <SheetSection title="Activity">
        <ol className="space-y-2" data-testid="payout-activity">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                  step.at
                    ? "border-status-emerald-500/40 bg-status-emerald-500/15 text-status-emerald-700 dark:text-status-emerald-300"
                    : "border-border",
                )}
                aria-hidden
              >
                {step.at ? <CheckIcon className="size-3" weight="bold" /> : null}
              </span>
              <div className="min-w-0">
                <p className={step.at ? undefined : "text-muted-foreground"}>{step.label}</p>
                {step.at ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(step.at)}
                    {step.detail ? ` · ${step.detail}` : ""}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </SheetSection>

      <SheetSection title="Links">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={payoutLineupHref(row)}>
              Open in Lineup
              <ArrowSquareOutIcon className="size-3" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/events/${row.eventId}`}>Open event</Link>
          </Button>
          {row.status === "pending_onboarding" ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/users/organizations?org=${encodeURIComponent(row.organizationId)}`}>
                Manage onboarding
              </Link>
            </Button>
          ) : null}
        </div>
      </SheetSection>

      <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
        {row.status === "cancelled" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => handlers.restore(row))}>
            Restore payout
          </Button>
        ) : row.status !== "paid" ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                // Cancelling the confirm (or a failed removal) keeps the panel open.
                if (await handlers.remove(row)) onClose();
              })
            }
          >
            Remove payout
          </Button>
        ) : null}
        {primary ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => handlers.runPrimary(row))}>
            {primary.label}
          </Button>
        ) : null}
      </SheetFooter>

      <EditPayoutDialog
        row={editing ? row : null}
        onOpenChange={(open) => {
          if (!open) setEditing(false);
        }}
        onSaved={() => {
          notify.success("Payout updated.");
          setEditing(false);
        }}
      />
    </>
  );
}

/** A paid payout's transfer number, correctable when it was mistyped. */
function TransferNumberField({ row }: { row: PayoutRow }) {
  const correctNumber = useMutation(api.bandPayments.correctServicePaymentNumber);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    try {
      await correctNumber({ paymentId: row._id, servicePaymentNumber: draft });
      notify.success("Transfer number updated.");
      setDraft(null);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetField label="Transfer #">
      {draft === null ? (
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{row.servicePaymentNumber ?? "Not recorded"}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setDraft(row.servicePaymentNumber ?? "")}
          >
            Edit
          </Button>
        </span>
      ) : (
        <span className="flex flex-col items-start gap-2">
          <Input
            id={`payout-transfer-number-${row._id}`}
            aria-label="Transfer number"
            className="h-8 w-full tabular-nums"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") setDraft(null);
            }}
          />
          <span className="flex gap-2">
            <Button type="button" size="sm" disabled={saving || !draft.trim()} onClick={() => void save()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </span>
        </span>
      )}
    </SheetField>
  );
}

async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    notify.success(message);
  } catch {
    notify.error("Could not copy to the clipboard.");
  }
}

/**
 * The Student Service Payment form, filled from the payout. The line
 * description carries the payout ID so the GrantED statement import can match
 * the payment and mark this payout paid with its S-number.
 */
function GrantedFilingSection({ row }: { row: PayoutRow }) {
  const fields = grantedFilingFields(row);
  return (
    <SheetSection
      title="File in GrantED"
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() =>
            void copyText(fields.map((f) => `${f.label}: ${f.value}`).join("\n"), "GrantED details copied.")
          }
        >
          Copy all
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        Keep the payout ID in the line description: importing the next statement then marks this payout paid
        with GrantED&apos;s S-number. Attach the {row.emailConfirmationUrl ? "email screenshot" : "agreement PDF"} to
        the line.
      </p>
      <dl className="space-y-1.5">
        {fields.map((field) => (
          <div key={field.label} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-start gap-2 text-sm">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="min-w-0 break-words">{field.value}</dd>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label={`Copy ${field.label.toLowerCase()}`}
              onClick={() => void copyText(field.value, `${field.label} copied.`)}
            >
              <CopyIcon className="size-3.5" />
            </Button>
          </div>
        ))}
      </dl>
      {row.emailConfirmationUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={row.emailConfirmationUrl} target="_blank" rel="noreferrer">
            Email screenshot
          </a>
        </Button>
      ) : row.canDownloadAgreementPdf ? (
        <BandPaymentAgreementPdfButton paymentId={row._id} label="Agreement PDF" />
      ) : null}
    </SheetSection>
  );
}

/**
 * When the artist agreed by email instead of signing in the portal: attach a
 * screenshot of their reply and the payout counts as signed.
 */
function EmailConfirmationSection({ row }: { row: PayoutRow }) {
  const generateUploadUrl = useMutation(api.bandPayments.generateEmailConfirmationUploadUrl);
  const confirmByEmail = useMutation(api.bandPayments.confirmByEmail);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const prepared = file.type.startsWith("image/") ? await compressImageToLimit(file) : file;
      const response = await fetch(await generateUploadUrl({}), {
        method: "POST",
        headers: { "Content-Type": prepared.type || "application/octet-stream" },
        body: prepared,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await confirmByEmail({ paymentId: row._id, storageFileId: storageId });
      notify.success("Confirmed by email. The payout is ready to pay.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not attach the screenshot."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <SheetSection title="Confirmed by email instead?">
      <p className="text-xs text-muted-foreground">
        If {row.designatedPayeeName ?? "the artist"} agreed by email rather than signing here, attach a screenshot of
        their reply. It stays on the payout as the record, and the payout moves to ready to pay.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "Attaching…" : "Attach email screenshot"}
      </Button>
    </SheetSection>
  );
}
